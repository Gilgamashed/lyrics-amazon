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

/// Amazon Music is preferred when multiple MPRIS players are active, keeping
/// the source-priority structure consistent with the Windows adapter. Live
/// validation on Linux hardware is deferred (fixture/contract-covered here).
fn is_amazon_player(player: &str) -> bool {
    let lower = player.to_lowercase();
    let normalized: String = lower
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    normalized.contains("amazonmusic") || (lower.contains("amazon") && lower.contains("music"))
}

/// Returns the MPRIS player name to query: the Amazon Music player when one is
/// listed, otherwise `None` so playerctl falls back to its own active player.
fn preferred_player() -> Option<String> {
    let output = Command::new("playerctl").arg("-l").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .find(|line| is_amazon_player(line))
        .map(|line| line.to_string())
}

impl NowPlayingSource for LinuxMprisSource {
    fn current(&self) -> Option<NowPlaying> {
        let mut command = Command::new("playerctl");
        if let Some(player) = preferred_player() {
            command.args(["--player", &player]);
        }
        let output = command
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

    #[test]
    fn is_amazon_player_matches_amazon_music_identifiers() {
        assert!(is_amazon_player("amazon-music"));
        assert!(is_amazon_player("AmazonMusic"));
        assert!(is_amazon_player("amazon music"));
    }

    #[test]
    fn is_amazon_player_rejects_other_players() {
        assert!(!is_amazon_player("spotify"));
        assert!(!is_amazon_player("vlc"));
        assert!(!is_amazon_player(""));
    }
}
