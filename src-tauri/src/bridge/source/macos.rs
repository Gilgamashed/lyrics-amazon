use std::process::Command;

use crate::bridge::now_playing::NowPlaying;
use crate::bridge::source::parsers::parse_nowplaying_cli_json;
use crate::bridge::source::{NowPlayingSource, SOURCE_ID};

pub struct MacOsMediaRemoteSource;

impl MacOsMediaRemoteSource {
    pub fn new() -> Self {
        Self
    }
}

/// Amazon Music is preferred when multiple media sources are active, keeping the
/// source-priority structure consistent with the Windows adapter. `nowplaying-cli`
/// exposes only the system's current source, so this helper documents the shared
/// matching contract; live multi-source validation on macOS hardware is deferred.
#[allow(dead_code)]
pub(crate) fn is_amazon_app(app_id: &str) -> bool {
    let lower = app_id.to_lowercase();
    let normalized: String = lower
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    normalized.contains("amazonmusic") || (lower.contains("amazon") && lower.contains("music"))
}

impl NowPlayingSource for MacOsMediaRemoteSource {
    fn current(&self) -> Option<NowPlaying> {
        let output = Command::new("nowplaying-cli")
            .arg("get-raw")
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }

        parse_nowplaying_cli_json(SOURCE_ID, &output.stdout)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_id_matches_macos_adapter() {
        assert_eq!(SOURCE_ID, "macos-mediaremote");
    }

    #[test]
    fn parses_samples_through_shared_parser() {
        let fixture = r#"{"kMRMediaRemoteNowPlayingInfoTitle":"Night Moves","kMRMediaRemoteNowPlayingInfoArtist":"Bob Seger","kMRMediaRemoteNowPlayingInfoPlaybackRate":1.0}"#;
        let np = parse_nowplaying_cli_json(SOURCE_ID, fixture.as_bytes()).unwrap();
        assert_eq!(np.title.as_deref(), Some("Night Moves"));
        assert!(np.is_playing);
    }

    #[test]
    fn is_amazon_app_matches_amazon_music_identifiers() {
        assert!(is_amazon_app("com.amazon.music"));
        assert!(is_amazon_app("Amazon Music"));
        assert!(!is_amazon_app("com.spotify.client"));
    }
}
