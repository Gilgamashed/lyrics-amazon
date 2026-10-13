use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub source: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: Option<i64>,
    pub position_ms: Option<i64>,
    pub is_playing: bool,
}

impl NowPlaying {
    pub fn idle(source: &str) -> Self {
        Self {
            source: source.to_string(),
            title: None,
            artist: None,
            album: None,
            duration_ms: None,
            position_ms: None,
            is_playing: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_camel_case_with_nullable_fields() {
        let np = NowPlaying {
            source: "windows-smtc".to_string(),
            title: Some("Song".to_string()),
            artist: None,
            album: Some("Album".to_string()),
            duration_ms: Some(200_000),
            position_ms: None,
            is_playing: true,
        };

        let json = serde_json::to_value(&np).unwrap();
        assert_eq!(json["source"], "windows-smtc");
        assert_eq!(json["title"], "Song");
        assert!(json["artist"].is_null());
        assert_eq!(json["album"], "Album");
        assert_eq!(json["durationMs"], 200_000);
        assert!(json["positionMs"].is_null());
        assert_eq!(json["isPlaying"], true);
    }

    #[test]
    fn deserializes_from_camel_case() {
        let json = r#"{"source":"s","title":"Song","artist":null,"album":null,"durationMs":null,"positionMs":null,"isPlaying":false}"#;
        let np: NowPlaying = serde_json::from_str(json).unwrap();
        assert_eq!(np.source, "s");
        assert_eq!(np.title.as_deref(), Some("Song"));
        assert_eq!(np.artist, None);
        assert_eq!(np.duration_ms, None);
        assert!(!np.is_playing);
    }

    #[test]
    fn idle_has_no_metadata() {
        let np = NowPlaying::idle("windows-smtc");
        assert_eq!(np.source, "windows-smtc");
        assert!(np.title.is_none());
        assert!(np.artist.is_none());
        assert!(np.album.is_none());
        assert_eq!(np.duration_ms, None);
        assert_eq!(np.position_ms, None);
        assert!(!np.is_playing);
    }
}
