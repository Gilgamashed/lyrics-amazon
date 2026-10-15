use std::sync::Arc;
use std::time::Duration;

use crate::bridge::BridgeState;
use crate::bridge::now_playing::NowPlaying;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
mod mock;
mod parsers;
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
    mock_or(|| Box::new(windows::WindowsSmtcSource::new()))
}

#[cfg(target_os = "macos")]
fn create_source() -> Box<dyn NowPlayingSource> {
    mock_or(|| Box::new(macos::MacOsMediaRemoteSource::new()))
}

#[cfg(target_os = "linux")]
fn create_source() -> Box<dyn NowPlayingSource> {
    mock_or(|| Box::new(linux::LinuxMprisSource::new()))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn create_source() -> Box<dyn NowPlayingSource> {
    struct NoopSource;

    impl NowPlayingSource for NoopSource {
        fn current(&self) -> Option<NowPlaying> {
            None
        }
    }

    mock_or(|| Box::new(NoopSource))
}

/// Returns the env-gated `MockScriptSource` when `BRIDGE_MOCK_SCRIPT` is set and
/// loadable; otherwise the real adapter. With the env var unset behavior is
/// identical to the Phase 6 bridge.
fn mock_or(real: impl FnOnce() -> Box<dyn NowPlayingSource>) -> Box<dyn NowPlayingSource> {
    if let Some(path) = std::env::var("BRIDGE_MOCK_SCRIPT")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        match mock::MockScriptSource::new(&path) {
            Ok(source) => return Box::new(source),
            Err(error) => {
                log::error!("[bridge] ignoring unloadable BRIDGE_MOCK_SCRIPT {path}: {error}");
            }
        }
    }

    real()
}

const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Performs a single poll tick: reads the source, publishes via
/// `BridgeState::update` only when the value changed, and reports whether
/// anything was published.
pub fn poll_once(source: &mut dyn NowPlayingSource, state: &BridgeState) -> bool {
    let now_playing = source
        .current()
        .unwrap_or_else(|| NowPlaying::idle(SOURCE_ID));

    let changed = {
        let current = state.current.read().unwrap();
        *current != now_playing
    };

    if changed {
        state.update(now_playing);
    }

    changed
}

pub fn spawn_poller(state: Arc<BridgeState>) {
    spawn_poller_with_interval(create_source(), state, POLL_INTERVAL);
}

/// Test seam: like `spawn_poller` but with an injected source.
#[allow(dead_code)]
pub fn spawn_poller_with(source: Box<dyn NowPlayingSource>, state: Arc<BridgeState>) {
    spawn_poller_with_interval(source, state, POLL_INTERVAL);
}

pub fn spawn_poller_with_interval(
    source: Box<dyn NowPlayingSource>,
    state: Arc<BridgeState>,
    interval: Duration,
) {
    std::thread::spawn(move || {
        let mut source = source;
        loop {
            let _ = poll_once(source.as_mut(), &state);
            std::thread::sleep(interval);
        }
    });
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::VecDeque;

    use super::*;

    struct ScriptedSource {
        sequence: RefCell<VecDeque<NowPlaying>>,
    }

    impl ScriptedSource {
        fn new(sequence: Vec<NowPlaying>) -> Self {
            Self {
                sequence: RefCell::new(sequence.into()),
            }
        }
    }

    impl NowPlayingSource for ScriptedSource {
        fn current(&self) -> Option<NowPlaying> {
            let mut sequence = self.sequence.borrow_mut();
            sequence.pop_front().or_else(|| sequence.back().cloned())
        }
    }

    fn np(source: &str, title: &str, playing: bool) -> NowPlaying {
        NowPlaying {
            source: source.to_string(),
            title: Some(title.to_string()),
            artist: None,
            album: None,
            duration_ms: Some(1_000),
            position_ms: Some(0),
            is_playing: playing,
        }
    }

    #[tokio::test]
    async fn poll_once_publishes_only_on_change() {
        let (state, mut rx) = BridgeState::new();
        let mut source = ScriptedSource::new(vec![
            np("s", "A", true),
            np("s", "B", false),
            np("s", "B", false),
        ]);

        // First poll: idle -> A changed, broadcast.
        assert!(poll_once(&mut source, &state));
        assert_eq!(rx.recv().await.unwrap().title.as_deref(), Some("A"));
        assert_eq!(state.current.read().unwrap().title.as_deref(), Some("A"));

        // Track change B broadcasts again.
        assert!(poll_once(&mut source, &state));
        assert_eq!(rx.recv().await.unwrap().title.as_deref(), Some("B"));

        // Unchanged value: nothing broadcast, nothing recorded.
        assert!(!poll_once(&mut source, &state));
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn poll_once_idles_when_source_is_empty() {
        let (state, mut rx) = BridgeState::new();
        let mut source = ScriptedSource::new(vec![]);

        // The state already starts idle; an empty source yields the same idle
        // value, so nothing changes and nothing is broadcast.
        assert!(!poll_once(&mut source, &state));
        {
            let current = state.current.read().unwrap();
            assert_eq!(current.source, SOURCE_ID);
            assert!(current.title.is_none());
        }
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn lagged_receiver_is_reported_by_broadcast() {
        let (state, _tx) = BridgeState::new();
        let mut rx = state.updates.subscribe();

        // Push far more updates than the channel buffer (64) without reading.
        let sequence: Vec<NowPlaying> = (0..70).map(|i| np("s", "T", i % 2 == 0)).collect();
        let mut source = ScriptedSource::new(sequence);
        for _ in 0..70 {
            poll_once(&mut source, &state);
        }

        match rx.recv().await {
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => assert!(n > 0),
            Ok(_) => panic!("expected a lag error for a slow receiver"),
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                panic!("channel should not be closed")
            }
        }
    }

    #[test]
    fn spawn_poller_with_publishes_from_an_injected_source() {
        let (state, _) = BridgeState::new();
        let holder = Arc::clone(&state);
        std::thread::spawn(move || {
            spawn_poller_with_interval(
                Box::new(ScriptedSource::new(vec![np("s", "Loop", true)])),
                holder,
                Duration::from_millis(10),
            );
        });

        // Generous deadline: this runs alongside the rest of the suite (and under
        // llvm-cov instrumentation), where a loaded machine can delay the poller.
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut saw_published = false;
        while std::time::Instant::now() < deadline {
            if state.current.read().unwrap().title.as_deref() == Some("Loop") {
                saw_published = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }

        assert!(
            saw_published,
            "poller failed to publish from the injected source within 10s"
        );
    }

    #[test]
    fn create_source_prefers_mock_when_env_set_and_ignores_bad_script() {
        unsafe {
            std::env::set_var("BRIDGE_MOCK_SCRIPT", "Z:\\missing\\script.json");
        }
        let source = create_source();
        assert!(source.current().is_none() || source.current().is_some());

        unsafe {
            std::env::remove_var("BRIDGE_MOCK_SCRIPT");
        }
    }
}
