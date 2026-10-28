//! Windows UIAutomation metadata fallback (spec 18).
//!
//! W0 established that `RawViewWalker` under-reports the live Amazon Music
//! tree; `FindAll(TreeScope_Descendants, TrueCondition)` exposes the player-bar
//! title/artist. This module keeps a pure, fixture-testable model for that
//! discovery and a long-lived worker that owns all COM objects. The poller only
//! sends non-blocking requests and reads a small cache.
#![cfg(target_os = "windows")]

use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
};
use windows::core::{BOOL, PWSTR};

use crate::bridge::NowPlaying;

const MAX_NODES: usize = 5000;
const DEFAULT_RETRIES: u32 = 4;
const DEFAULT_TIMEOUT_MS: u64 = 2000;
const FAILURE_CACHE_MS: u64 = 5000;
const ATTEMPT_COOLDOWN_MS: u64 = 2000;
const SPARSE_NODE_HINT: usize = 50;

/// The bounded UIA attempt outcome exposed to the diagnostics terminal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiaAttempt {
    Found,
    Timeout,
    SparseTree,
    NoAnchor,
    Disabled,
}

impl UiaAttempt {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Found => "found",
            Self::Timeout => "timeout",
            Self::SparseTree => "sparse-tree",
            Self::NoAnchor => "no-anchor",
            Self::Disabled => "disabled",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UiaMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UiaReadResult {
    pub metadata: Option<UiaMetadata>,
    pub attempt: UiaAttempt,
    pub nodes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmtcSnapshot {
    pub app_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub position_ms: Option<i64>,
    pub is_playing: bool,
}

impl SmtcSnapshot {
    pub fn from_now_playing(now: &NowPlaying) -> Self {
        Self {
            app_id: now.app_id.clone(),
            title: now.title.clone(),
            artist: now.artist.clone(),
            album: now.album.clone(),
            position_ms: now.position_ms,
            is_playing: now.is_playing,
        }
    }

    /// Stable identity for the cache/debounce. UIA corrections are only valid
    /// for the exact raw SMTC reading that triggered them.
    pub fn key(&self) -> String {
        [
            self.app_id.as_deref().unwrap_or(""),
            self.title.as_deref().unwrap_or(""),
            self.artist.as_deref().unwrap_or(""),
            self.album.as_deref().unwrap_or(""),
        ]
        .join("\u{1f}")
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Bounds {
    fn width(&self) -> i32 {
        self.right - self.left
    }

    fn height(&self) -> i32 {
        self.bottom - self.top
    }

    fn inside(&self, container: &Bounds, tolerance: i32) -> bool {
        self.left >= container.left - tolerance
            && self.right <= container.right + tolerance
            && self.top >= container.top - tolerance
            && self.bottom <= container.bottom + tolerance
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiaNode {
    pub id: usize,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub control_type: Option<i32>,
    #[serde(default)]
    pub automation_id: Option<String>,
    #[serde(default)]
    pub bounds: Option<Bounds>,
}

#[cfg(test)]
#[derive(Debug, Deserialize)]
struct UiaCaptureFixture {
    nodes: Vec<UiaNode>,
}

const PLACEHOLDERS: &[&str] = &[
    "artist name",
    "song name",
    "track name",
    "now playing",
    "unknown",
    "unknown artist",
    "unknown track",
    "unknown title",
];

const UI_LABELS: &[&str] = &[
    "letras",
    "ultra hd",
    "ver mais",
    "reproduzir",
    "pausar",
    "adicionar",
];

fn trimmed_lower(value: &str) -> String {
    value.trim().to_lowercase()
}

fn is_placeholder(value: &str) -> bool {
    PLACEHOLDERS.contains(&trimmed_lower(value).as_str())
}

fn is_ui_label(value: &str) -> bool {
    UI_LABELS.contains(&trimmed_lower(value).as_str())
}

fn is_noise_content(content: &str) -> bool {
    let lower = content.to_lowercase();
    [
        "remaster",
        "deluxe",
        "version",
        " live",
        "explicit",
        "clean",
        "anniversary",
        "mono",
        "stereo",
        "reissue",
        "re-issue",
        "bonus",
        "instrumental",
        "acoustic",
        "demo",
        "feat",
        "ft.",
        "featuring",
    ]
    .iter()
    .any(|word| lower.contains(word))
        || lower.chars().all(|ch| ch.is_ascii_digit())
}

/// Removes bracketed release noise and trailing featuring credits. This mirrors
/// the frontend's pattern-gated normalization; display text is never changed.
fn strip_release_noise(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut bracket = String::new();
    let mut depth = 0usize;

    for ch in input.chars() {
        match ch {
            '(' | '[' | '{' => {
                if depth == 0 {
                    bracket.clear();
                }
                depth += 1;
            }
            ')' | ']' | '}' => {
                if depth > 0 {
                    depth -= 1;
                    if depth == 0 && !is_noise_content(&bracket) {
                        output.push(' ');
                        output.push_str(&bracket);
                        output.push(' ');
                    }
                    bracket.clear();
                } else {
                    output.push(ch);
                }
            }
            _ if depth > 0 => bracket.push(ch),
            _ => output.push(ch),
        }
    }

    let lower = output.to_lowercase();
    for marker in [" feat.", " ft.", " featuring"] {
        if let Some(index) = lower.find(marker) {
            output.truncate(index);
            break;
        }
    }
    output
}

fn normalize_identity(value: &str) -> String {
    strip_release_noise(value)
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn identity_eq(a: &str, b: &str) -> bool {
    let a = normalize_identity(a);
    !a.is_empty() && a == normalize_identity(b)
}

fn artist_missing(artist: Option<&str>) -> bool {
    artist
        .map(|value| value.trim().is_empty() || is_placeholder(value))
        .unwrap_or(true)
}

fn title_suspicious(title: Option<&str>, artist: Option<&str>, album: Option<&str>) -> bool {
    let Some(title) = title else {
        return true;
    };
    if title.trim().is_empty() || is_placeholder(title) {
        return true;
    }
    if artist.is_some_and(|artist| !artist.trim().is_empty() && identity_eq(title, artist)) {
        return true;
    }
    album.is_some_and(|album| !album.trim().is_empty() && identity_eq(title, album))
}

/// Whether the raw SMTC metadata warrants a UIA scan. Empty/unknown artist is
/// deliberately a trigger even when the title is healthy (Most Played accuracy).
pub fn needs_uia(title: Option<&str>, artist: Option<&str>, album: Option<&str>) -> bool {
    title_suspicious(title, artist, album) || artist_missing(artist)
}

fn parse_clock(value: &str) -> Option<i64> {
    let value = value.trim();
    if value.starts_with('-') {
        return None;
    }
    let (minutes, seconds) = value.split_once(':')?;
    if minutes.is_empty() || minutes.len() > 2 || seconds.len() != 2 {
        return None;
    }
    if !minutes.chars().all(|ch| ch.is_ascii_digit())
        || !seconds.chars().all(|ch| ch.is_ascii_digit())
    {
        return None;
    }
    let minutes: i64 = minutes.parse().ok()?;
    let seconds: i64 = seconds.parse().ok()?;
    if seconds >= 60 {
        return None;
    }
    Some(minutes * 60_000 + seconds * 1000)
}

fn container_clock<'a>(nodes: &'a [UiaNode], container: &Bounds) -> Option<&'a UiaNode> {
    nodes.iter().find(|node| {
        let Some(name) = node.name.as_deref() else {
            return false;
        };
        let Some(bounds) = node.bounds.as_ref() else {
            return false;
        };
        parse_clock(name).is_some()
            && bounds.bottom >= container.top - 100
            && bounds.top <= container.top + 40
            && bounds.left >= container.left - 40
            && bounds.left <= container.left + 240
    })
}

fn candidate_title<'a>(nodes: &'a [UiaNode], container: &Bounds) -> Option<&'a UiaNode> {
    let mut candidates: Vec<&UiaNode> = nodes
        .iter()
        .filter(|node| {
            let Some(name) = node.name.as_deref() else {
                return false;
            };
            let Some(bounds) = node.bounds.as_ref() else {
                return false;
            };
            let top_row = bounds.top <= container.top + 25 && bounds.bottom <= container.top + 46;
            bounds.inside(container, 5)
                && top_row
                && bounds.width() > 10
                && bounds.height() > 5
                && !name.trim().is_empty()
                && !is_placeholder(name)
                && !is_ui_label(name)
                && matches!(node.control_type, Some(50005) | Some(50020))
        })
        .collect();
    candidates.sort_by_key(|node| {
        let link_rank = if node.control_type == Some(50005) {
            0
        } else {
            1
        };
        let left = node
            .bounds
            .as_ref()
            .map(|bounds| bounds.left)
            .unwrap_or(i32::MAX);
        (link_rank, left)
    });
    candidates.first().copied()
}

fn candidate_artist<'a>(
    nodes: &'a [UiaNode],
    container: &Bounds,
    title: Option<&UiaNode>,
) -> Option<&'a UiaNode> {
    let mut candidates: Vec<&UiaNode> = nodes
        .iter()
        .filter(|node| {
            let Some(name) = node.name.as_deref() else {
                return false;
            };
            let Some(bounds) = node.bounds.as_ref() else {
                return false;
            };
            let artist_row = bounds.top >= container.top + 18
                && bounds.top <= container.top + 60
                && bounds.bottom <= container.bottom;
            bounds.inside(container, 5)
                && artist_row
                && bounds.width() > 10
                && bounds.height() > 5
                && !name.trim().is_empty()
                && !is_placeholder(name)
                && !is_ui_label(name)
                && name.trim() != "\u{2022}"
                && title.is_none_or(|title| title.id != node.id)
                && matches!(node.control_type, Some(50005) | Some(50020))
        })
        .collect();
    candidates.sort_by_key(|node| {
        let link_rank = if node.control_type == Some(50005) {
            0
        } else {
            1
        };
        let left = node
            .bounds
            .as_ref()
            .map(|bounds| bounds.left)
            .unwrap_or(i32::MAX);
        (link_rank, left)
    });
    candidates.first().copied()
}

fn metadata_from_container(
    nodes: &[UiaNode],
    container: &UiaNode,
) -> Option<(UiaMetadata, i64, bool)> {
    let bounds = container.bounds.as_ref()?;
    let clock_node = container_clock(nodes, bounds)?;
    let clock = parse_clock(clock_node.name.as_deref()?)?;
    let title = candidate_title(nodes, bounds);
    let artist = candidate_artist(nodes, bounds, title);
    if title.is_none() && artist.is_none() {
        return None;
    }
    Some((
        UiaMetadata {
            title: title.and_then(|node| node.name.clone()),
            artist: artist.and_then(|node| node.name.clone()),
        },
        clock,
        true,
    ))
}

/// Extracts a metadata candidate from a flat `FindAll` capture.
///
/// Duplicate player bars are ranked by clock proximity to the SMTC position;
/// containers without a clock are not considered when another viable bar exists.
pub fn extract_metadata_from_nodes(nodes: &[UiaNode], smtc: &SmtcSnapshot) -> UiaReadResult {
    if nodes.is_empty() {
        return UiaReadResult {
            metadata: None,
            attempt: UiaAttempt::SparseTree,
            nodes: 0,
        };
    }

    let containers: Vec<&UiaNode> = nodes
        .iter()
        .filter(|node| node.automation_id.as_deref() == Some("transportContainer"))
        .filter(|node| node.bounds.is_some())
        .collect();

    if containers.is_empty() {
        let has_clock = nodes
            .iter()
            .any(|node| node.name.as_deref().and_then(parse_clock).is_some());
        return UiaReadResult {
            metadata: None,
            attempt: if nodes.len() < SPARSE_NODE_HINT && !has_clock {
                UiaAttempt::SparseTree
            } else {
                UiaAttempt::NoAnchor
            },
            nodes: nodes.len(),
        };
    }

    let mut saw_clock = false;
    let mut best: Option<(i64, UiaMetadata)> = None;

    for container in &containers {
        if container_clock(nodes, container.bounds.as_ref().expect("checked")).is_some() {
            saw_clock = true;
        }
        let Some((metadata, clock, _)) = metadata_from_container(nodes, container) else {
            continue;
        };
        let mut score = 0i64;
        if let Some(position) = smtc.position_ms {
            score -= (clock - position).abs();
        }
        if metadata.title.is_some() {
            score += 1_000;
        }
        if metadata.artist.is_some() {
            score += 500;
        }
        if best
            .as_ref()
            .is_none_or(|(best_score, _)| score > *best_score)
        {
            best = Some((score, metadata));
        }
    }

    match best {
        Some((_, metadata)) => UiaReadResult {
            metadata: Some(metadata),
            attempt: UiaAttempt::Found,
            nodes: nodes.len(),
        },
        None => UiaReadResult {
            metadata: None,
            attempt: if !saw_clock && nodes.len() < SPARSE_NODE_HINT {
                UiaAttempt::SparseTree
            } else {
                UiaAttempt::NoAnchor
            },
            nodes: nodes.len(),
        },
    }
}

fn candidate_title_is_valid(candidate: &str, smtc: &SmtcSnapshot) -> bool {
    let candidate = candidate.trim();
    if candidate.is_empty() || is_placeholder(candidate) || is_ui_label(candidate) {
        return false;
    }
    if smtc
        .artist
        .as_deref()
        .is_some_and(|artist| identity_eq(candidate, artist))
    {
        return false;
    }
    if smtc
        .album
        .as_deref()
        .is_some_and(|album| identity_eq(candidate, album))
    {
        return false;
    }
    true
}

fn candidate_artist_is_valid(candidate: &str) -> bool {
    let candidate = candidate.trim();
    !candidate.is_empty() && !is_placeholder(candidate) && !is_ui_label(candidate)
}

/// Merges a UIA candidate into the raw SMTC metadata under the spec-18 rules.
/// Only suspicious fields are replaced; a healthy title wins over UIA. The
/// returned metadata contains only the fields that should change.
pub fn merge_metadata(smtc: &SmtcSnapshot, candidate: &UiaMetadata) -> Option<UiaMetadata> {
    let title_bad = title_suspicious(
        smtc.title.as_deref(),
        smtc.artist.as_deref(),
        smtc.album.as_deref(),
    );
    let artist_bad = artist_missing(smtc.artist.as_deref());
    if !title_bad && !artist_bad {
        return None;
    }

    let mut merged = UiaMetadata {
        title: None,
        artist: None,
    };

    if title_bad
        && let Some(candidate_title) = candidate.title.as_deref()
        && candidate_title_is_valid(candidate_title, smtc)
    {
        merged.title = Some(candidate_title.to_string());
    }

    if artist_bad {
        let title_guard = if title_bad {
            true
        } else {
            candidate
                .title
                .as_deref()
                .zip(smtc.title.as_deref())
                .is_some_and(|(candidate_title, smtc_title)| {
                    identity_eq(candidate_title, smtc_title)
                })
        };
        if title_guard
            && let Some(candidate_artist) = candidate.artist.as_deref()
            && candidate_artist_is_valid(candidate_artist)
        {
            merged.artist = Some(candidate_artist.to_string());
        }
    }

    if merged.title.is_none() && merged.artist.is_none() {
        None
    } else {
        Some(merged)
    }
}

#[derive(Debug, Clone, Copy)]
struct UiaConfig {
    retries: u32,
    timeout: Duration,
}

impl UiaConfig {
    fn from_env() -> Self {
        let retries = std::env::var("LYRICS_AMAZON_UIA_RETRIES")
            .ok()
            .and_then(|value| value.trim().parse::<u32>().ok())
            .unwrap_or(DEFAULT_RETRIES)
            .clamp(1, 10);
        let timeout_ms = std::env::var("LYRICS_AMAZON_UIA_TIMEOUT_MS")
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok())
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            .clamp(200, 10_000);
        Self {
            retries,
            timeout: Duration::from_millis(timeout_ms),
        }
    }
}

#[derive(Debug, Clone)]
struct CachedResult {
    metadata: Option<UiaMetadata>,
    attempt: UiaAttempt,
    at: Instant,
}

#[derive(Default)]
struct UiaState {
    key: String,
    result: Option<CachedResult>,
    in_flight: bool,
    last_attempt: Option<Instant>,
}

struct UiaJob {
    key: String,
    smtc: SmtcSnapshot,
}

struct UiaService {
    tx: std::sync::mpsc::Sender<UiaJob>,
    state: std::sync::Arc<std::sync::Mutex<UiaState>>,
}

impl UiaService {
    fn new(config: UiaConfig) -> Self {
        let (tx, rx) = std::sync::mpsc::channel::<UiaJob>();
        let state = std::sync::Arc::new(std::sync::Mutex::new(UiaState::default()));
        let worker_state = std::sync::Arc::clone(&state);
        let _ = thread::Builder::new()
            .name("uia-worker".to_string())
            .spawn(move || unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                let automation: Result<IUIAutomation, _> =
                    CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER);

                while let Ok(job) = rx.recv() {
                    let result = match &automation {
                        Ok(automation) => read_with_retry(automation, &job.smtc, config),
                        Err(error) => {
                            log::warn!("[uia] failed to create IUIAutomation: {error}");
                            CachedResult {
                                metadata: None,
                                attempt: UiaAttempt::Timeout,
                                at: Instant::now(),
                            }
                        }
                    };
                    if let Ok(mut state) = worker_state.lock()
                        && state.key == job.key
                    {
                        state.in_flight = false;
                        state.last_attempt = Some(Instant::now());
                        state.result = Some(result);
                    }
                }
                CoUninitialize();
            });
        Self { tx, state }
    }

    fn cached(&self, key: &str) -> Option<CachedResult> {
        let state = self.state.lock().ok()?;
        if state.key != key {
            return None;
        }
        let result = state.result.as_ref()?;
        if result.metadata.is_some()
            || result.at.elapsed() < Duration::from_millis(FAILURE_CACHE_MS)
        {
            Some(result.clone())
        } else {
            None
        }
    }

    fn request(&self, key: &str, smtc: &SmtcSnapshot) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        if state.key != key {
            state.key = key.to_string();
            state.result = None;
            state.in_flight = false;
            state.last_attempt = None;
        }
        if state.in_flight {
            return;
        }
        if state
            .result
            .as_ref()
            .is_some_and(|result| result.metadata.is_some())
        {
            return;
        }
        if state
            .last_attempt
            .is_some_and(|at| at.elapsed() < Duration::from_millis(ATTEMPT_COOLDOWN_MS))
        {
            return;
        }
        state.in_flight = true;
        let job = UiaJob {
            key: key.to_string(),
            smtc: smtc.clone(),
        };
        if self.tx.send(job).is_err() {
            state.in_flight = false;
        }
    }
}

pub struct UiaRuntime {
    enabled: bool,
    service: Option<UiaService>,
}

impl UiaRuntime {
    pub fn from_env() -> Self {
        let enabled = std::env::var("LYRICS_AMAZON_UIA")
            .ok()
            .map(|value| {
                let value = value.trim().to_lowercase();
                value != "0" && value != "false" && value != "off"
            })
            .unwrap_or(true);
        let service = enabled.then(|| UiaService::new(UiaConfig::from_env()));
        Self { enabled, service }
    }

    pub fn enrich(&self, mut now: NowPlaying) -> NowPlaying {
        let raw = SmtcSnapshot::from_now_playing(&now);
        if !needs_uia(
            raw.title.as_deref(),
            raw.artist.as_deref(),
            raw.album.as_deref(),
        ) {
            return now;
        }
        if !self.enabled {
            now.uia_attempt = Some(UiaAttempt::Disabled.as_str().to_string());
            return now;
        }
        let Some(service) = self.service.as_ref() else {
            return now;
        };
        let key = raw.key();
        let cached = service.cached(&key);
        if cached.is_none() {
            service.request(&key, &raw);
        }
        let Some(cached) = cached else {
            return now;
        };
        now.uia_attempt = Some(cached.attempt.as_str().to_string());
        if let Some(candidate) = cached.metadata
            && let Some(merged) = merge_metadata(&raw, &candidate)
        {
            if let Some(title) = merged.title {
                now.title = Some(title);
            }
            if let Some(artist) = merged.artist {
                now.artist = Some(artist);
            }
            now.metadata_source = Some("smtc+uia".to_string());
            now.source_title = Some(raw.title.unwrap_or_default());
            now.source_artist = Some(raw.artist.unwrap_or_default());
        }
        now
    }
}

fn read_with_retry(
    automation: &IUIAutomation,
    smtc: &SmtcSnapshot,
    config: UiaConfig,
) -> CachedResult {
    let started = Instant::now();
    let mut last = UiaAttempt::NoAnchor;

    for attempt in 0..config.retries.max(1) {
        if let Some(hwnd) = find_amazon_window() {
            match collect_nodes(automation, hwnd) {
                Ok(nodes) => {
                    let result = extract_metadata_from_nodes(&nodes, smtc);
                    if result.attempt == UiaAttempt::Found {
                        log::debug!("[uia] candidate found in {} nodes", result.nodes);
                        return CachedResult {
                            metadata: result.metadata,
                            attempt: result.attempt,
                            at: Instant::now(),
                        };
                    }
                    last = result.attempt;
                }
                Err(error) => {
                    log::debug!("[uia] tree capture failed: {error}");
                    last = UiaAttempt::Timeout;
                }
            }
        } else {
            last = UiaAttempt::NoAnchor;
        }

        let remaining = config.timeout.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return CachedResult {
                metadata: None,
                attempt: UiaAttempt::Timeout,
                at: Instant::now(),
            };
        }
        let backoff = match attempt {
            0 => 100,
            1 => 250,
            _ => 500,
        };
        thread::sleep(remaining.min(Duration::from_millis(backoff)));
    }

    CachedResult {
        metadata: None,
        attempt: last,
        at: Instant::now(),
    }
}

fn collect_nodes(automation: &IUIAutomation, hwnd: HWND) -> windows::core::Result<Vec<UiaNode>> {
    unsafe {
        let root = automation.ElementFromHandle(hwnd)?;
        let condition = automation.CreateTrueCondition()?;
        let array = root.FindAll(TreeScope_Descendants, &condition)?;
        let length = array.Length()?.max(0) as usize;
        let mut nodes = Vec::with_capacity(length.min(MAX_NODES));
        for index in 0..length.min(MAX_NODES) {
            let element = array.GetElement(index as i32)?;
            if let Some(mut node) = read_node(&element) {
                node.id = nodes.len();
                nodes.push(node);
            }
        }
        Ok(nodes)
    }
}

fn read_node(element: &IUIAutomationElement) -> Option<UiaNode> {
    unsafe {
        let name = element
            .CurrentName()
            .ok()
            .map(|value| value.to_string())
            .filter(|value| !value.trim().is_empty());
        let control_type = element.CurrentControlType().ok().map(|value| value.0);
        let automation_id = element
            .CurrentAutomationId()
            .ok()
            .map(|value| value.to_string())
            .filter(|value| !value.trim().is_empty());
        let bounds = element.CurrentBoundingRectangle().ok().map(|rect| Bounds {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
        });
        Some(UiaNode {
            id: 0,
            name,
            control_type,
            automation_id,
            bounds,
        })
    }
}

#[derive(Clone, Copy)]
struct WindowSearch {
    visible: Option<isize>,
    any: Option<isize>,
}

unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let search = unsafe { &mut *(lparam.0 as *mut WindowSearch) };
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 || !process_is_amazon_music(pid) {
        return BOOL(1);
    }
    search.any.get_or_insert(hwnd.0 as isize);
    if unsafe { IsWindowVisible(hwnd) }.0 != 0 {
        let mut buffer = [0u16; 256];
        let length = unsafe { GetWindowTextW(hwnd, &mut buffer) } as usize;
        let title = String::from_utf16_lossy(&buffer[..length.min(buffer.len())]);
        if title.to_lowercase().contains("amazon music") {
            search.visible.get_or_insert(hwnd.0 as isize);
        }
    }
    BOOL(1)
}

fn find_amazon_window() -> Option<HWND> {
    let mut search = WindowSearch {
        visible: None,
        any: None,
    };
    unsafe {
        let _ = EnumWindows(
            Some(enum_window),
            LPARAM(&mut search as *mut WindowSearch as isize),
        );
    }
    search
        .visible
        .or(search.any)
        .map(|value| HWND(value as *mut std::ffi::c_void))
}

fn process_is_amazon_music(pid: u32) -> bool {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return false;
        };
        let mut buffer = vec![0u16; 512];
        let mut size = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(handle);
        if result.is_err() {
            return false;
        }
        let path = String::from_utf16_lossy(&buffer[..(size as usize).min(buffer.len())]);
        path.rsplit(['/', '\\'])
            .next()
            .is_some_and(|name| name.eq_ignore_ascii_case("Amazon Music.exe"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> Vec<UiaNode> {
        let json = match name {
            "playing" => include_str!("../../tests/fixtures/uia/player-playing.json"),
            "paused" => include_str!("../../tests/fixtures/uia/player-paused.json"),
            "nonlatin" => include_str!("../../tests/fixtures/uia/player-nonlatin.json"),
            "duplicate" => include_str!("../../tests/fixtures/uia/player-duplicate.json"),
            "sparse" => include_str!("../../tests/fixtures/uia/player-sparse.json"),
            other => panic!("unknown fixture {other}"),
        };
        serde_json::from_str::<UiaCaptureFixture>(json)
            .expect("fixture parses")
            .nodes
    }

    fn smtc() -> SmtcSnapshot {
        SmtcSnapshot {
            app_id: Some("AmazonMusic.exe".to_string()),
            title: Some("".to_string()),
            artist: Some("Rage Against The Machine".to_string()),
            album: Some("Rage Against The Machine".to_string()),
            position_ms: Some(74_000),
            is_playing: true,
        }
    }

    #[test]
    fn suspicious_triggers_include_missing_and_unknown_artist() {
        assert!(needs_uia(None, None, None));
        assert!(needs_uia(Some(""), Some("Chevelle"), None));
        assert!(needs_uia(Some("Breed"), Some(""), None));
        assert!(needs_uia(Some("Breed"), Some("Unknown Artist"), None));
        assert!(needs_uia(Some("Periphery"), Some("Periphery"), None));
        assert!(needs_uia(
            Some("The Red"),
            Some("Chevelle"),
            Some("The Red")
        ));
        assert!(!needs_uia(Some("Breed"), Some("Nirvana"), None));
    }

    #[test]
    fn extracts_the_live_player_title_and_artist() {
        let result = extract_metadata_from_nodes(&fixture("playing"), &smtc());
        assert_eq!(result.attempt, UiaAttempt::Found);
        let metadata = result.metadata.expect("metadata");
        assert_eq!(
            metadata.title.as_deref(),
            Some("Killing In the Name [Explicit]")
        );
        assert_eq!(metadata.artist.as_deref(), Some("Rage Against The Machine"));
    }

    #[test]
    fn paused_playback_is_accepted_without_clock_progression() {
        let mut paused = smtc();
        paused.is_playing = false;
        let result = extract_metadata_from_nodes(&fixture("paused"), &paused);
        assert_eq!(result.attempt, UiaAttempt::Found);
        assert_eq!(
            result
                .metadata
                .and_then(|metadata| metadata.artist)
                .as_deref(),
            Some("Rage Against The Machine")
        );
    }

    #[test]
    fn duplicate_players_choose_the_clock_matching_smtc_position() {
        let result = extract_metadata_from_nodes(&fixture("duplicate"), &smtc());
        assert_eq!(result.attempt, UiaAttempt::Found);
        let metadata = result.metadata.expect("metadata");
        assert_eq!(
            metadata.title.as_deref(),
            Some("Killing In the Name [Explicit]")
        );
    }

    #[test]
    fn non_latin_titles_survive_the_fixture_path() {
        let result = extract_metadata_from_nodes(&fixture("nonlatin"), &smtc());
        let metadata = result.metadata.expect("metadata");
        assert_eq!(
            metadata.title.as_deref(),
            Some("\u{6771}\u{4eac}\u{4e8b}\u{5909}")
        );
        assert_eq!(
            metadata.artist.as_deref(),
            Some("\u{690e}\u{540d}\u{6797}\u{6a8e}")
        );
    }

    #[test]
    fn sparse_tree_reports_sparse_instead_of_guessing() {
        let result = extract_metadata_from_nodes(&fixture("sparse"), &smtc());
        assert_eq!(result.attempt, UiaAttempt::SparseTree);
        assert!(result.metadata.is_none());
    }

    #[test]
    fn artist_only_recovery_requires_a_matching_title() {
        let raw = SmtcSnapshot {
            title: Some("Killing In the Name".to_string()),
            artist: Some("".to_string()),
            album: None,
            ..smtc()
        };
        let candidate = UiaMetadata {
            title: Some("Killing In the Name [Explicit]".to_string()),
            artist: Some("Rage Against The Machine".to_string()),
        };
        let merged = merge_metadata(&raw, &candidate).expect("artist recovered");
        assert_eq!(merged.title, None);
        assert_eq!(merged.artist.as_deref(), Some("Rage Against The Machine"));

        let wrong = UiaMetadata {
            title: Some("A Totally Different Song".to_string()),
            artist: Some("Someone Else".to_string()),
        };
        assert!(merge_metadata(&raw, &wrong).is_none());
    }

    #[test]
    fn healthy_metadata_is_never_overwritten() {
        let raw = SmtcSnapshot {
            title: Some("Breed".to_string()),
            artist: Some("Nirvana".to_string()),
            album: Some("Nevermind".to_string()),
            ..smtc()
        };
        let candidate = UiaMetadata {
            title: Some("Something Else".to_string()),
            artist: Some("Someone Else".to_string()),
        };
        assert!(merge_metadata(&raw, &candidate).is_none());
        assert!(!needs_uia(
            raw.title.as_deref(),
            raw.artist.as_deref(),
            raw.album.as_deref()
        ));
    }

    #[test]
    fn clock_parser_accepts_elapsed_text_only() {
        assert_eq!(parse_clock("01:14"), Some(74_000));
        assert_eq!(parse_clock("0:05"), Some(5_000));
        assert_eq!(parse_clock("-03:59"), None);
        assert_eq!(parse_clock("74:00"), Some(74 * 60_000));
        assert_eq!(parse_clock("01:60"), None);
        assert_eq!(parse_clock("no clock"), None);
    }

    #[test]
    fn release_noise_and_non_latin_text_stay_comparable() {
        assert_eq!(
            normalize_identity("Killing In the Name [Explicit]"),
            normalize_identity("Killing In the Name (Remastered 2011)")
        );
        assert_eq!(normalize_identity("Pós"), "pós");
        assert_eq!(normalize_identity("東京事変"), "東京事変");
    }

    #[test]
    fn attempt_labels_are_stable_for_diagnostics() {
        assert_eq!(UiaAttempt::Found.as_str(), "found");
        assert_eq!(UiaAttempt::Timeout.as_str(), "timeout");
        assert_eq!(UiaAttempt::SparseTree.as_str(), "sparse-tree");
        assert_eq!(UiaAttempt::NoAnchor.as_str(), "no-anchor");
        assert_eq!(UiaAttempt::Disabled.as_str(), "disabled");
    }

    #[test]
    fn disabled_runtime_marks_a_suspicious_reading_without_scanning() {
        let runtime = UiaRuntime {
            enabled: false,
            service: None,
        };
        let mut now = NowPlaying::idle("windows-smtc");
        now.title = Some("Breed".to_string());
        now.artist = None;
        let enriched = runtime.enrich(now);
        assert_eq!(enriched.uia_attempt.as_deref(), Some("disabled"));
        assert_eq!(enriched.title.as_deref(), Some("Breed"));
    }

    #[test]
    #[ignore = "requires the live Amazon Music window"]
    fn live_worker_recovers_current_track_metadata() {
        let runtime = UiaRuntime::from_env();
        let mut raw = NowPlaying::idle("windows-smtc");
        raw.title = Some(String::new());
        raw.artist = Some(String::new());
        raw.is_playing = true;

        for _ in 0..50 {
            let enriched = runtime.enrich(raw.clone());
            if enriched.metadata_source.as_deref() == Some("smtc+uia") {
                println!(
                    "live UIA recovered {:?} / {:?} (attempt {:?})",
                    enriched.title, enriched.artist, enriched.uia_attempt
                );
                assert!(
                    enriched
                        .title
                        .as_deref()
                        .is_some_and(|value| !value.trim().is_empty())
                );
                assert!(
                    enriched
                        .artist
                        .as_deref()
                        .is_some_and(|value| !value.trim().is_empty())
                );
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("live UIA worker did not recover metadata from the Amazon Music window");
    }

    #[test]
    fn missing_title_is_recovered_but_placeholder_candidates_are_rejected() {
        let raw = SmtcSnapshot {
            title: Some("".to_string()),
            artist: Some("Chevelle".to_string()),
            album: None,
            ..smtc()
        };
        let candidate = UiaMetadata {
            title: Some("The Red".to_string()),
            artist: Some("Chevelle".to_string()),
        };
        let merged = merge_metadata(&raw, &candidate).expect("title recovered");
        assert_eq!(merged.title.as_deref(), Some("The Red"));

        let placeholder = UiaMetadata {
            title: Some("Artist name".to_string()),
            artist: Some("Chevelle".to_string()),
        };
        assert!(merge_metadata(&raw, &placeholder).is_none());
    }
}
