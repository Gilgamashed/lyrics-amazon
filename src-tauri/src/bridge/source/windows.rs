use std::sync::{Arc, Once};
use std::task::{Context, Poll, Wake, Waker};

use ::windows::Foundation::TimeSpan;
use ::windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use ::windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use ::windows::core::Result as WinResult;

use crate::bridge::now_playing::NowPlaying;
use crate::bridge::source::{NowPlayingSource, SOURCE_ID};

static COM_INIT: Once = Once::new();

pub struct WindowsSmtcSource;

impl WindowsSmtcSource {
    pub fn new() -> Self {
        COM_INIT.call_once(|| unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        });
        Self
    }
}

impl NowPlayingSource for WindowsSmtcSource {
    fn current(&self) -> Option<NowPlaying> {
        query_smtc().ok().flatten()
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
    }))
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
                return read_session(&session);
            }
        }
    }

    // Otherwise fall back to the system's current session (unchanged behavior).
    let Ok(session) = manager.GetCurrentSession() else {
        return Ok(None);
    };

    read_session(&session)
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
}
