use std::sync::{Arc, Once};
use std::task::{Context, Poll, Wake, Waker};

use ::windows::Foundation::TimeSpan;
use ::windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager,
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

fn query_smtc() -> WinResult<Option<NowPlaying>> {
    let manager = block_on(async {
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await
    })?;
    let Ok(session) = manager.GetCurrentSession() else {
        return Ok(None);
    };

    let is_playing = session.GetPlaybackInfo()?.PlaybackStatus()?
        == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

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
