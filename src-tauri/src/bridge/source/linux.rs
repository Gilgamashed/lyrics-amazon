use std::process::Command;

use crate::bridge::now_playing::NowPlaying;
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
        let mut fields = text.trim().splitn(6, '\t');

        let title = clean_optional(fields.next());
        let artist = clean_optional(fields.next());
        let album = clean_optional(fields.next());
        let duration_ms = fields.next().and_then(parse_micros_to_ms);
        let position_ms = fields.next().and_then(parse_micros_to_ms);
        let is_playing = fields
            .next()
            .map(|value| value.trim() == "Playing")
            .unwrap_or(false);

        Some(NowPlaying {
            source: SOURCE_ID.to_string(),
            title,
            artist,
            album,
            duration_ms,
            position_ms,
            is_playing,
        })
    }
}

fn clean_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn parse_micros_to_ms(value: &str) -> Option<i64> {
    let micros = value.trim().parse::<i64>().ok()?;
    (micros > 0).then_some(micros / 1000)
}
