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
}
