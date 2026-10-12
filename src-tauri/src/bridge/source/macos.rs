use std::process::Command;

use serde_json::Value;

use crate::bridge::now_playing::NowPlaying;
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

        let raw: Value = serde_json::from_slice(&output.stdout).ok()?;
        let playback_rate =
            number_field(&raw, "kMRMediaRemoteNowPlayingInfoPlaybackRate").unwrap_or(0.0);

        Some(NowPlaying {
            source: SOURCE_ID.to_string(),
            title: string_field(&raw, "kMRMediaRemoteNowPlayingInfoTitle"),
            artist: string_field(&raw, "kMRMediaRemoteNowPlayingInfoArtist"),
            album: string_field(&raw, "kMRMediaRemoteNowPlayingInfoAlbum"),
            duration_ms: number_field(&raw, "kMRMediaRemoteNowPlayingInfoDuration")
                .map(seconds_to_ms),
            position_ms: number_field(&raw, "kMRMediaRemoteNowPlayingInfoElapsedTime")
                .map(seconds_to_ms),
            is_playing: playback_rate > 0.0,
        })
    }
}

fn string_field(raw: &Value, key: &str) -> Option<String> {
    raw.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn number_field(raw: &Value, key: &str) -> Option<f64> {
    raw.get(key).and_then(Value::as_f64)
}

fn seconds_to_ms(value: f64) -> i64 {
    (value * 1000.0) as i64
}
