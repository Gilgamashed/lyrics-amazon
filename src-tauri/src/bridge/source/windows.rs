use std::sync::{Arc, Once};
use std::task::{Context, Poll, Wake, Waker};

use ::windows::Foundation::TimeSpan;
use ::windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionMediaProperties,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use ::windows::Storage::Streams::{DataReader, IRandomAccessStream};
use ::windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use ::windows::core::{Interface, Result as WinResult};
use base64::Engine;

use crate::bridge::now_playing::NowPlaying;
use crate::bridge::source::{NowPlayingSource, SOURCE_ID};
use crate::bridge::uia::UiaRuntime;

/// Upper bound on the album-art payload embedded as a `data:` URL. SMTC
/// thumbnails are already compressed image streams; oversized art is dropped
/// rather than truncated so we never emit a corrupt image.
const MAX_ALBUM_ART_BYTES: usize = 256 * 1024;

static COM_INIT: Once = Once::new();

pub struct WindowsSmtcSource {
    uia: UiaRuntime,
}

impl WindowsSmtcSource {
    pub fn new() -> Self {
        COM_INIT.call_once(|| unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        });
        Self {
            uia: UiaRuntime::from_env(),
        }
    }
}

impl NowPlayingSource for WindowsSmtcSource {
    fn current(&self) -> Option<NowPlaying> {
        query_smtc().ok().flatten().map(|now| self.uia.enrich(now))
    }
}

/// Amazon Music is preferred when multiple media sessions are playing so a
/// concurrent YouTube/TikTok/other SMTC session cannot win the system's
/// "current session".
pub(crate) fn is_amazon_app(app_id: &str) -> bool {
    let lower = app_id.to_lowercase();
    let normalized: String = lower
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    normalized.contains("amazonmusic") || (lower.contains("amazon") && lower.contains("music"))
}

fn session_is_playing(session: &GlobalSystemMediaTransportControlsSession) -> bool {
    matches!(
        session
            .GetPlaybackInfo()
            .and_then(|info| info.PlaybackStatus()),
        Ok(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
    )
}

fn read_session(
    session: &GlobalSystemMediaTransportControlsSession,
    app_id: &str,
) -> WinResult<Option<NowPlaying>> {
    let is_playing = session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .map(|status| status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(false);

    let (position_ms, duration_ms) = match session.GetTimelineProperties() {
        Ok(timeline) => (
            time_span_to_ms(timeline.Position()?),
            time_span_to_ms(timeline.EndTime()?),
        ),
        Err(_) => (None, None),
    };

    let media = block_on(async { session.TryGetMediaPropertiesAsync()?.await })?;

    Ok(Some(NowPlaying {
        source: SOURCE_ID.to_string(),
        title: clean(media.Title()),
        artist: clean(media.Artist()),
        album: clean(media.AlbumTitle()),
        duration_ms,
        position_ms,
        is_playing,
        app_id: (!app_id.trim().is_empty()).then(|| app_id.to_string()),
        is_amazon: is_amazon_app(app_id),
        album_art: read_thumbnail(&media),
        metadata_source: None,
        source_title: None,
        source_artist: None,
        uia_attempt: None,
    }))
}

/// Best-effort read of the SMTC thumbnail as a size-capped `data:` URL. Any
/// failure (missing art, unreadable stream, oversized payload) degrades to
/// `None` so detection is never blocked by artwork.
fn read_thumbnail(
    media: &GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    let reference = media.Thumbnail().ok()?;
    let stream = block_on(async { reference.OpenReadAsync()?.await }).ok()?;

    let size = stream.Size().ok()? as usize;
    if size == 0 || size > MAX_ALBUM_ART_BYTES {
        return None;
    }

    let input = stream
        .cast::<IRandomAccessStream>()
        .ok()?
        .GetInputStreamAt(0)
        .ok()?;
    let reader = DataReader::CreateDataReader(&input).ok()?;
    block_on(async { reader.LoadAsync(size as u32)?.await }).ok()?;

    let mut buffer = vec![0u8; size];
    reader.ReadBytes(&mut buffer).ok()?;

    let mime = stream
        .ContentType()
        .map(|value| value.to_string())
        .unwrap_or_default();
    encode_thumbnail_data_url(&mime, &buffer)
}

/// Pure encoder for the thumbnail: returns `None` for empty or oversized
/// payloads, otherwise a `data:<mime>;base64,<bytes>` URL defaulting to JPEG
/// when the stream reports no content type.
fn encode_thumbnail_data_url(mime: &str, bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() || bytes.len() > MAX_ALBUM_ART_BYTES {
        return None;
    }
    let mime = mime.trim();
    let mime = if mime.is_empty() { "image/jpeg" } else { mime };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

fn query_smtc() -> WinResult<Option<NowPlaying>> {
    let manager = block_on(async {
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await
    })?;

    // Prefer an actively playing Amazon Music session when one is present.
    if let Ok(sessions) = manager.GetSessions() {
        for session in sessions {
            let app_id = session
                .SourceAppUserModelId()
                .map(|id| id.to_string())
                .unwrap_or_default();
            if is_amazon_app(&app_id) && session_is_playing(&session) {
                return read_session(&session, &app_id);
            }
        }
    }

    // Otherwise fall back to the system's current session (unchanged behavior),
    // still reporting its identity so the UI can distinguish Amazon from other
    // concurrent media sessions.
    let Ok(session) = manager.GetCurrentSession() else {
        return Ok(None);
    };

    let app_id = session
        .SourceAppUserModelId()
        .map(|id| id.to_string())
        .unwrap_or_default();
    read_session(&session, &app_id)
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    struct ThreadWaker(std::thread::Thread);

    impl Wake for ThreadWaker {
        fn wake(self: Arc<Self>) {
            self.0.unpark();
        }
    }

    let mut future = Box::pin(future);
    let waker = Waker::from(Arc::new(ThreadWaker(std::thread::current())));
    let mut context = Context::from_waker(&waker);

    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(output) => return output,
            Poll::Pending => std::thread::park(),
        }
    }
}

fn clean(value: WinResult<::windows::core::HSTRING>) -> Option<String> {
    value
        .ok()
        .map(|text| text.to_string())
        .filter(|text| !text.trim().is_empty())
}

fn time_span_to_ms(value: TimeSpan) -> Option<i64> {
    let ms = value.Duration / 10_000;
    (ms > 0).then_some(ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn time_span_converts_hundreds_of_nanoseconds_to_ms() {
        assert_eq!(time_span_to_ms(TimeSpan { Duration: 250_000 }), Some(25));
        assert_eq!(time_span_to_ms(TimeSpan { Duration: 10_500 }), Some(1));
    }

    #[test]
    fn time_span_rejects_zero_and_negative() {
        assert_eq!(time_span_to_ms(TimeSpan { Duration: 0 }), None);
        assert_eq!(time_span_to_ms(TimeSpan { Duration: -5_000 }), None);
    }

    #[test]
    fn clean_keeps_text_and_drops_blank() {
        assert_eq!(
            clean(Ok(::windows::core::HSTRING::from("Track Title"))).as_deref(),
            Some("Track Title")
        );
        assert_eq!(clean(Ok(::windows::core::HSTRING::from("   "))), None);
        assert_eq!(
            clean(Err(::windows::core::Error::from_hresult(
                ::windows::core::HRESULT(-1)
            ))),
            None
        );
    }

    #[test]
    fn is_amazon_app_matches_amazon_music_identifiers() {
        assert!(is_amazon_app("AmazonMusic.exe"));
        assert!(is_amazon_app("Amazon Music"));
        assert!(is_amazon_app("com.amazon.music"));
        assert!(is_amazon_app("AmazonMusicforWindows_8ck5d0f57g2e2!App"));
    }

    #[test]
    fn is_amazon_app_rejects_other_media_apps() {
        assert!(!is_amazon_app("chrome.exe"));
        assert!(!is_amazon_app("Spotify.exe"));
        assert!(!is_amazon_app("Amazon Prime Video"));
        assert!(!is_amazon_app(""));
    }

    #[test]
    fn encode_thumbnail_builds_a_data_url() {
        let url = encode_thumbnail_data_url("image/png", &[1, 2, 3, 4]).unwrap();
        assert_eq!(url, "data:image/png;base64,AQIDBA==");
    }

    #[test]
    fn encode_thumbnail_defaults_to_jpeg_for_blank_mime() {
        let url = encode_thumbnail_data_url("   ", &[0xff, 0xd8]).unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn encode_thumbnail_rejects_empty_and_oversized_payloads() {
        assert_eq!(encode_thumbnail_data_url("image/png", &[]), None);
        let oversized = vec![0u8; MAX_ALBUM_ART_BYTES + 1];
        assert_eq!(encode_thumbnail_data_url("image/png", &oversized), None);
        let at_cap = vec![0u8; MAX_ALBUM_ART_BYTES];
        assert!(encode_thumbnail_data_url("image/png", &at_cap).is_some());
    }
}
