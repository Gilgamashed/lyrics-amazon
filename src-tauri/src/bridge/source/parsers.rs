// Platform-neutral metadata parsers shared by the per-OS adapters. On any single
// host the exports are exercised only by tests or by the adapters for other
// platforms, so dead-code warnings are suppressed for the non-test build.
#![allow(dead_code)]

use serde_json::Value;

use crate::bridge::now_playing::NowPlaying;

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

/// Parses the `nowplaying-cli get-raw` JSON payload (MediaRemote keys on macOS).
/// Returns `None` when the payload is not valid JSON.
pub fn parse_nowplaying_cli_json(source: &str, input: &[u8]) -> Option<NowPlaying> {
    let raw: Value = serde_json::from_slice(input).ok()?;
    let playback_rate =
        number_field(&raw, "kMRMediaRemoteNowPlayingInfoPlaybackRate").unwrap_or(0.0);

    Some(NowPlaying {
        source: source.to_string(),
        title: string_field(&raw, "kMRMediaRemoteNowPlayingInfoTitle"),
        artist: string_field(&raw, "kMRMediaRemoteNowPlayingInfoArtist"),
        album: string_field(&raw, "kMRMediaRemoteNowPlayingInfoAlbum"),
        duration_ms: number_field(&raw, "kMRMediaRemoteNowPlayingInfoDuration").map(seconds_to_ms),
        position_ms: number_field(&raw, "kMRMediaRemoteNowPlayingInfoElapsedTime")
            .map(seconds_to_ms),
        is_playing: playback_rate > 0.0,
    })
}

/// Parses the `playerctl metadata --format` output (`title\tartist\talbum\tmpris:length\tposition\tstatus`).
pub fn parse_playerctl_metadata(source: &str, text: &str) -> Option<NowPlaying> {
    let text = String::from_utf8_lossy(text.as_bytes());
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
        source: source.to_string(),
        title,
        artist,
        album,
        duration_ms,
        position_ms,
        is_playing,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SRC: &str = "test-source";

    fn cli_fixture() -> Value {
        serde_json::json!({
            "kMRMediaRemoteNowPlayingInfoTitle": "Song Title",
            "kMRMediaRemoteNowPlayingInfoArtist": "Artist Name",
            "kMRMediaRemoteNowPlayingInfoAlbum": "Album Name",
            "kMRMediaRemoteNowPlayingInfoDuration": 200.5,
            "kMRMediaRemoteNowPlayingInfoElapsedTime": 42.25,
            "kMRMediaRemoteNowPlayingInfoPlaybackRate": 1.0
        })
    }

    #[test]
    fn nowplaying_cli_parses_full_fixture() {
        let payload = cli_fixture();
        let np = parse_nowplaying_cli_json(SRC, &serde_json::to_vec(&payload).unwrap()).unwrap();

        assert_eq!(np.source, SRC);
        assert_eq!(np.title.as_deref(), Some("Song Title"));
        assert_eq!(np.artist.as_deref(), Some("Artist Name"));
        assert_eq!(np.album.as_deref(), Some("Album Name"));
        assert_eq!(np.duration_ms, Some(200_500));
        assert_eq!(np.position_ms, Some(42_250));
        assert!(np.is_playing);
    }

    #[test]
    fn nowplaying_cli_paused_when_playback_rate_zero() {
        let mut payload = cli_fixture();
        payload["kMRMediaRemoteNowPlayingInfoPlaybackRate"] = serde_json::json!(0.0);

        let np = parse_nowplaying_cli_json(SRC, &serde_json::to_vec(&payload).unwrap()).unwrap();
        assert!(!np.is_playing);
    }

    #[test]
    fn nowplaying_cli_drops_blank_text_fields() {
        let mut payload = cli_fixture();
        payload["kMRMediaRemoteNowPlayingInfoTitle"] = serde_json::json!("   ");

        let np = parse_nowplaying_cli_json(SRC, &serde_json::to_vec(&payload).unwrap()).unwrap();
        assert_eq!(np.title, None);
        assert_eq!(np.artist.as_deref(), Some("Artist Name"));
    }

    #[test]
    fn nowplaying_cli_missing_fields_stay_null() {
        let np = parse_nowplaying_cli_json(SRC, b"{}").unwrap();

        assert_eq!(np.title, None);
        assert_eq!(np.artist, None);
        assert_eq!(np.album, None);
        assert_eq!(np.duration_ms, None);
        assert_eq!(np.position_ms, None);
        assert!(!np.is_playing);
    }

    #[test]
    fn nowplaying_cli_rejects_malformed_and_garbage() {
        assert_eq!(parse_nowplaying_cli_json(SRC, b"not json"), None);
        assert_eq!(parse_nowplaying_cli_json(SRC, &[0xff, 0xfe, 0xfd]), None);
        assert_eq!(parse_nowplaying_cli_json(SRC, b""), None);

        // Valid-but-wrong-shaped JSON still yields an empty snapshot.
        let np = parse_nowplaying_cli_json(SRC, b"[1,2,3]").unwrap();
        assert_eq!(np.title, None);
        assert!(!np.is_playing);
    }

    #[test]
    fn playerctl_parses_full_fixture() {
        let np =
            parse_playerctl_metadata(SRC, "Song\tArtist\tAlbum\t240000000\t120000000\tPlaying")
                .unwrap();

        assert_eq!(np.source, SRC);
        assert_eq!(np.title.as_deref(), Some("Song"));
        assert_eq!(np.artist.as_deref(), Some("Artist"));
        assert_eq!(np.album.as_deref(), Some("Album"));
        assert_eq!(np.duration_ms, Some(240_000));
        assert_eq!(np.position_ms, Some(120_000));
        assert!(np.is_playing);
    }

    #[test]
    fn playerctl_not_playing_status() {
        let np = parse_playerctl_metadata(SRC, "Song\tArtist\tAlbum\t240000000\t120000000\tPaused")
            .unwrap();
        assert!(!np.is_playing);
    }

    #[test]
    fn playerctl_empty_fields() {
        let np = parse_playerctl_metadata(SRC, "\t\t\t\t\t").unwrap();

        assert_eq!(np.title, None);
        assert_eq!(np.artist, None);
        assert_eq!(np.album, None);
        assert_eq!(np.duration_ms, None);
        assert_eq!(np.position_ms, None);
        assert!(!np.is_playing);
    }

    #[test]
    fn playerctl_non_numeric_and_non_positive_lengths_are_null() {
        let np = parse_playerctl_metadata(SRC, "Song\tArtist\tAlbum\tabc\t-5\tPlaying").unwrap();
        assert_eq!(np.duration_ms, None);
        assert_eq!(np.position_ms, None);
        assert!(np.is_playing);
    }

    #[test]
    fn playerctl_garbage_is_tolerated() {
        let np = parse_playerctl_metadata(SRC, "\u{FFFD}\u{FFFD} raw bytes\n").unwrap();
        assert_eq!(np.title.as_deref(), Some("\u{FFFD}\u{FFFD} raw bytes"));
        assert_eq!(np.artist, None);
        assert!(!np.is_playing);
    }
}
