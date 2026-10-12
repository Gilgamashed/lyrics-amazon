use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
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
