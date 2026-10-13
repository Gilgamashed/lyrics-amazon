use std::process::Command;

use crate::bridge::now_playing::NowPlaying;
use crate::bridge::source::parsers::parse_playerctl_metadata;
use crate::bridge::source::{NowPlayingSource, SOURCE_ID};

pub struct LinuxMprisSource;

impl LinuxMprisSource {
    pub fn new() -> Self {
        Self
    }
}

impl NowPlayingSource for LinuxMprisSource {
    fn current(&self) -> Option<NowPlaying> {
        let output = Command::new("playerctl")
            .args([
                "metadata",
                "--format",
                "{{title}}\t{{artist}}\t{{album}}\t{{mpris:length}}\t{{position}}\t{{status}}",
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }

        let text = String::from_utf8_lossy(&output.stdout);
        parse_playerctl_metadata(SOURCE_ID, &text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_id_matches_linux_adapter() {
        assert_eq!(SOURCE_ID, "linux-mpris");
    }

    #[test]
    fn parses_samples_through_shared_parser() {
        let np = parse_playerctl_metadata(
            SOURCE_ID,
            "Smells Like Teen Spirit\tNirvana\tNevermind\t260000000\t130000000\tPlaying",
        )
        .unwrap();
        assert_eq!(np.title.as_deref(), Some("Smells Like Teen Spirit"));
        assert!(np.is_playing);
    }
}
