use std::sync::Arc;
use std::time::Duration;

use crate::bridge::BridgeState;
use crate::bridge::now_playing::NowPlaying;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub const SOURCE_ID: &str = if cfg!(target_os = "windows") {
    "windows-smtc"
} else if cfg!(target_os = "macos") {
    "macos-mediaremote"
} else if cfg!(target_os = "linux") {
    "linux-mpris"
} else {
    "unsupported"
};

pub trait NowPlayingSource: Send {
    fn current(&self) -> Option<NowPlaying>;
}

#[cfg(target_os = "windows")]
fn create_source() -> Box<dyn NowPlayingSource> {
    Box::new(windows::WindowsSmtcSource::new())
}

#[cfg(target_os = "macos")]
fn create_source() -> Box<dyn NowPlayingSource> {
    Box::new(macos::MacOsMediaRemoteSource::new())
}

#[cfg(target_os = "linux")]
fn create_source() -> Box<dyn NowPlayingSource> {
    Box::new(linux::LinuxMprisSource::new())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn create_source() -> Box<dyn NowPlayingSource> {
    struct NoopSource;

    impl NowPlayingSource for NoopSource {
        fn current(&self) -> Option<NowPlaying> {
            None
        }
    }

    Box::new(NoopSource)
}

const POLL_INTERVAL: Duration = Duration::from_secs(1);

pub fn spawn_poller(state: Arc<BridgeState>) {
    std::thread::spawn(move || {
        let source = create_source();
        loop {
            let now_playing = source
                .current()
                .unwrap_or_else(|| NowPlaying::idle(SOURCE_ID));

            let changed = {
                let current = state.current.read().unwrap();
                *current != now_playing
            };

            if changed {
                {
                    let mut current = state.current.write().unwrap();
                    *current = now_playing.clone();
                }
                let _ = state.updates.send(now_playing);
            }

            std::thread::sleep(POLL_INTERVAL);
        }
    });
}
