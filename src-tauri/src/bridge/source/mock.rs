use std::fs;
use std::time::Instant;

use serde::Deserialize;

use crate::bridge::now_playing::NowPlaying;
use crate::bridge::source::NowPlayingSource;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MockStep {
    hold_ms: u64,
    now_playing: NowPlaying,
}

/// A scripted `NowPlayingSource` driven by a JSON file. The script is a list of
/// `[{ "holdMs": number, "nowPlaying": NowPlaying }, ...]` steps that advances
/// through the steps over wall-clock time and loops when the script ends.
/// Activated only through the `BRIDGE_MOCK_SCRIPT=<path>` env var (tests).
pub struct MockScriptSource {
    steps: Vec<MockStep>,
    started_at: Instant,
}

impl MockScriptSource {
    pub fn new(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let text = fs::read_to_string(path)?;
        let steps: Vec<MockStep> = serde_json::from_str(&text)?;
        if steps.is_empty() {
            return Err("BRIDGE_MOCK_SCRIPT has no steps".into());
        }

        Ok(Self {
            steps,
            started_at: Instant::now(),
        })
    }

    fn select(&self) -> &MockStep {
        let elapsed_ms = self.started_at.elapsed().as_millis() as u64;
        let total: u64 = self.steps.iter().map(|step| step.hold_ms).sum();
        let cursor = if total == 0 { 0 } else { elapsed_ms % total };

        let mut acc = 0u64;
        for step in &self.steps {
            if cursor < acc + step.hold_ms {
                return step;
            }
            acc += step.hold_ms;
        }

        self.steps.last().unwrap()
    }
}

impl NowPlayingSource for MockScriptSource {
    fn current(&self) -> Option<NowPlaying> {
        Some(self.select().now_playing.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(hold_ms: u64, playing: bool) -> MockStep {
        MockStep {
            hold_ms,
            now_playing: NowPlaying {
                source: "mock".to_string(),
                title: Some("Track".to_string()),
                artist: None,
                album: None,
                duration_ms: Some(1000),
                position_ms: Some(0),
                is_playing: playing,
                app_id: None,
                is_amazon: false,
                album_art: None,
                metadata_source: None,
                source_title: None,
                source_artist: None,
                uia_attempt: None,
            },
        }
    }

    fn source(steps: Vec<MockStep>) -> MockScriptSource {
        MockScriptSource {
            steps,
            started_at: Instant::now() - std::time::Duration::from_millis(2_500),
        }
    }

    #[test]
    fn loads_a_script_from_disk() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("lyrics-mock-{}.json", std::process::id()));
        std::fs::write(
            &path,
            r#"[{"holdMs":1000,"nowPlaying":{"source":"mock","title":"First","artist":null,"album":null,"durationMs":1000,"positionMs":0,"isPlaying":true}},{"holdMs":1000,"nowPlaying":{"source":"mock","title":"Second","artist":null,"album":null,"durationMs":1000,"positionMs":0,"isPlaying":false}}]"#,
        )
        .unwrap();

        let source = MockScriptSource::new(path.to_str().unwrap()).unwrap();
        assert_eq!(source.steps.len(), 2);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn rejects_missing_and_malformed_scripts() {
        assert!(MockScriptSource::new("Z:\\definitely\\missing\\file.json").is_err());

        let dir = std::env::temp_dir();
        let path = dir.join(format!("lyrics-badmock-{}.json", std::process::id()));
        std::fs::write(&path, "not json").unwrap();
        assert!(MockScriptSource::new(path.to_str().unwrap()).is_err());
        std::fs::remove_file(&path).ok();

        std::fs::write(&path, "[]").unwrap();
        assert!(MockScriptSource::new(path.to_str().unwrap()).is_err());
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn advances_through_steps_and_loops() {
        let mut s = source(vec![step(1_000, true), step(1_000, false)]);

        // 2500ms elapsed, 2000ms total -> wraps to 500ms into step 1 (playing).
        assert!(s.current().unwrap().is_playing);

        // Jump the clock forward so we sit inside the second step.
        s.started_at = Instant::now() - std::time::Duration::from_millis(1_500);
        assert!(!s.current().unwrap().is_playing);

        // At exactly the total, wrap back to the first step.
        s.started_at = Instant::now() - std::time::Duration::from_millis(2_000);
        assert!(s.current().unwrap().is_playing);
    }

    #[test]
    fn rejects_empty_scripts() {
        let err = MockScriptSource::new("Z:\\definitely\\missing\\file.json");
        assert!(err.is_err());
    }
}
