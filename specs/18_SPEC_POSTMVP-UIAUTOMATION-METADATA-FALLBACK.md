# 18_SPEC_POSTMVP-UIAUTOMATION-METADATA-FALLBACK.md — Post-MVP: UIAutomation Metadata Fallback

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)  
**Track:** Post-MVP (follows `specs/17_SPEC_POSTMVP-DIAGNOSTICS-AND-LOOKUP-RECOVERY.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)  
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)  
**Target Release:** `0.5.6-rc.1` (published to `test-latest` channel)

---

## 1. Objective

Implement a reliable Windows UIAutomation (UIA) fallback to recover accurate track metadata from the Amazon Music desktop app when SMTC/bridge reports bad or incomplete data. This addresses the cases where SMTC gives wrong titles (album names in title slot), empty titles, title==artist duplicates, or an empty/unknown artist that even the improved metadata sanitizer (spec 17) cannot fully resolve without the real UI text.

UIA is a **confidence-scored recovery source**, not a more authoritative SMTC replacement. It must never replace a healthy SMTC identity, must never invent an artist or title when the accessibility tree is unavailable or ambiguous, and must never block or delay the main detection flow.

A second goal is **accurate Most Played attribution**: an empty or unknown artist is itself a UIA trigger, so a song is not permanently recorded under `Unknown Artist` when the real artist is visible in the Amazon Music window.

---

## 2. Context

### 2.1 Evidence from Spec 17

- Amazon Music CEF exposes real title/artist in its accessibility tree (`Breed` / `Nirvana` / `Nevermind (Remastered) [Explicit]`).
- The tree is transient: sometimes it has ~896 elements, other times only ~4 elements.
- `ControlType` conditions often return nothing, so they cannot be the only discovery mechanism.
- Duplicate player bars can exist with different clocks.
- Spec 17's sanitizer, artist memory and lookup variants recover many readings, but cannot recover a title the player never reports, cannot reliably detect every album-in-title reading, and cannot attribute a healthy title with an unknown artist to the correct artist for Most Played.

### 2.2 Root Causes Addressed

- **Album name in the title slot** (e.g. the SMTC title is the album, not the song).
- **Missing titles** — SMTC reports no title while the UI shows the actual song.
- **Ambiguous metadata** — `title == artist`, `title == album`, or a combined identity that the sanitizer cannot disambiguate safely.
- **Empty/unknown artist with a healthy title** — lyrics lookup can be title-only, but Most Played should still record the correct artist.
- **Transient or duplicate UIA trees** — the reader must degrade gracefully rather than guess.

### 2.3 W0 live findings (2026-10-28)

- `RawViewWalker` exposed only 12–43 elements on the live Amazon Music window, even while a track was playing.
- `FindAll(TreeScope_Descendants, TrueCondition)` exposed 365–578 elements and the real player-bar title/artist.
- The title and artist are link elements inside the `transportContainer` region; the elapsed-time text is a separate node above it.
- Page content can overlap the player region (e.g. a `REDISCOVER …` link with the same top coordinate as the artist), so candidate scoring must be container-aware.
- Repeated captures are transient: `RawViewWalker` varied between 25 and 43 nodes and `FindAll` between 365 and 578; the title node was missing from several sparse captures.
- Paused playback has a static clock and must not require a progressing clock.
- Minimized windows can still expose player data through `FindAll`, but with off-screen bounds and unreliable clocks.

Consequence: W1 must use **`FindAll(TrueCondition)` as the primary discovery mechanism**, with the raw walk as an optional context/ancestry aid. `ControlType` conditions must not be the only discovery path.

### 2.4 Current code map (corrected for this spec)

- The Windows adapter is **`src-tauri/src/bridge/source/windows.rs`** (not `src-tauri/src/bridge/windows.rs`).
- The real SMTC flow is `WindowsSmtcSource::current()` → `query_smtc()` → `read_session()`; there is no `get_now_playing()` function.
- The shared payload is `src-tauri/src/bridge/now_playing.rs` and the frontend `NowPlaying` type in `src/types/lyrics.ts`.
- The in-app Debug Terminal is frontend-only (`src/services/debugConsole.ts`); Rust `log` output alone does not make a UIA attempt observable there.
- `Win32_UI_Accessibility` is already enabled after spec 17. `UI_UIAutomation` is not required for the `RawViewWalker` COM approach; `UI_Automation` is not a valid feature.

---

## 3. Design Decisions

### 3.1 UIA is a fallback only

SMTC remains the primary source and always owns playback truth: `position_ms`, `duration_ms`, `is_playing`, `app_id`, `album_art`, and Amazon-session selection. UIA may replace only suspicious title/artist fields.

UIA is consulted only when the SMTC reading is suspicious:

- title is missing or a placeholder;
- `title == artist`;
- `title == album` (album-in-title);
- **artist is empty or an unknown/placeholder value, even when the title is healthy**;
- optionally, an ambiguous combined `"Artist - Title"` reading.

A healthy title/artist pair never triggers UIA.

### 3.2 Artist-only recovery for empty/unknown artist

When the title is healthy but the artist is empty, blank, or an unknown/placeholder value:

- UIA is used **only to recover the artist**; the healthy SMTC title is preserved.
- The UIA candidate's title must match the SMTC title using normalized identity matching, allowing release-noise decoration such as `(Remastered …)` or `[Explicit]`.
- If the candidate title differs, reject its artist too. A different player bar must not reattribute the song.
- If no confident artist is found, keep `Unknown Artist`; never invent one.

This is the rule that makes Most Played accurate without allowing UIA to replace a good title with a wrong one.

### 3.3 Non-blocking worker model

- The existing SMTC poller publishes immediately and never waits for UIA.
- A long-lived UIA worker consumes debounced jobs for suspicious raw identities.
- At most one UIA scan is in flight for a given raw identity.
- Successful UIA reads are cached briefly and invalidated when the raw identity changes.
- A UIA result is merged on a later poll tick only if it still belongs to the same raw identity.
- All UIA COM objects remain on the worker thread; initialize COM there and never share `IUIAutomation*` interfaces across threads.
- Total UIA budget is ~2 seconds per attempt, with bounded retries/backoff and a hard timeout.

Do not create a new thread per poll tick and do not make the poller wait for a UIA timeout.

### 3.4 Merge contract and precedence

- UIA may replace only suspicious title/artist fields; never overwrite a healthy SMTC title or artist.
- A high-confidence UIA result is applied once per raw SMTC identity, or after two identical reads, to prevent metadata and lookup oscillation.
- On timeout, sparse tree, no anchor, ambiguity, or a disabled flag, retain the SMTC reading unchanged.
- Precedence for identity fields:
  1. the user's manual Fix override;
  2. a high-confidence UIA recovery;
  3. the artist-scoped title memory from spec 17;
  4. raw SMTC metadata.
- A manual override must never be lost because UIA changed the raw identity.
- Preserve the original SMTC identity in the payload (`sourceTitle`, `sourceArtist`) so override keys and history correlation use the raw reading.
- A UIA correction for the same raw reading is a **metadata enrichment**, not a new detection session.

### 3.5 Bounded candidate-scoring discovery

The time anchor is a hint, not proof of a player bar. Do not depend on a single fixed parent/sibling walk or on "larger text".

1. Find the Amazon Music window associated with the current SMTC session/process, not merely the foreground window.
2. Discover candidates with bounded `FindAll(TreeScope_Descendants, TrueCondition)`; use `RawViewWalker` only as an optional ancestry/context aid. Do not rely on `ControlType` conditions.
3. Use elapsed-time text matching `^-?\d{1,2}:\d{2}$` as one candidate anchor.
4. Score nearby title/artist candidates by structural context, proximity, non-placeholder text and consistency across reads. Do not depend on font size.
5. For duplicate player bars, prefer the candidate whose clock is close to the SMTC position; use progression only while playing.
6. When paused, do not require a progressing clock.
7. Reject candidates whose identity is still suspicious or conflicts with the healthy SMTC title.

### 3.6 Diagnostics and feature flag

- Add `metadataSource: "smtc" | "smtc+uia"` to `NowPlaying` (Rust and TypeScript), plus optional `sourceTitle` / `sourceArtist`.
- Add a bounded `uiaAttempt` summary such as `found`, `timeout`, `sparse-tree`, `no-anchor`, `disabled`.
- `bridgeService` logs `uia`/`detection` events on identity changes, not on every scan. These events must reach the in-app Debug Terminal.
- UIA is enabled for the rc; **`LYRICS_AMAZON_UIA=0`** is the kill switch. Retry and timeout values are configurable through `LYRICS_AMAZON_UIA_RETRIES` and `LYRICS_AMAZON_UIA_TIMEOUT_MS`.
- UIA is Windows-only; other platforms are unaffected.

---

## 4. Work Packages

### W0 — Live Tree Capture and Fixture Design

| Task | Responsibility |
| :--- | :--- |
| Add the read-only `src-tauri/examples/uia_probe.rs` and capture the live UIA tree for the playing, paused, minimized and sparse window states. | Delivery |
| Record the traversal finding: `RawViewWalker` under-reports; `FindAll(TrueCondition)` is the primary discovery path. | Quality |
| Turn the captures into sanitized player-region fixtures under `src-tauri/tests/fixtures/uia/`; compose the SMTC-side trigger variants (missing title, `title == artist`, album-in-title, unknown artist) on the captured tree. | Delivery |
| Do not change production behavior during this phase. | Quality |

### W1 — UIAutomation Infrastructure (Rust Bridge)

| Task | Responsibility |
| :--- | :--- |
| Add `src-tauri/src/bridge/uia.rs` (or `source/uia.rs` beside the adapter), cfg-gated for Windows, with UIA COM interop. | Delivery |
| Implement bounded `FindAll(TrueCondition)` discovery (with optional `RawViewWalker` ancestry), elapsed-time anchors, candidate scoring, and duplicate-player selection. | Delivery |
| Add the long-lived worker, debounce, TTL cache, bounded retries/backoff, timeout and feature flag. | Delivery |
| Keep all COM objects on the UIA worker thread; never share them with the poller. | Delivery |
| Add window/process discovery for the current SMTC session (using `Win32_UI_WindowsAndMessaging` / `Win32_System_Threading` as required). | Delivery |
| Tests: fixture-based tests for anchors, scoring, sparse trees, duplicate bars, paused playback, decorated and non-Latin titles, and merge-independent helpers. | Quality |

### W2 — Integration with the Windows Bridge

| Task | Responsibility |
| :--- | :--- |
| Integrate UIA into `src-tauri/src/bridge/source/windows.rs`, in the `WindowsSmtcSource::current()` → `query_smtc()` → `read_session()` flow. | Delivery |
| Trigger UIA only for the suspicious metadata rules above, including empty/unknown artist. | Delivery |
| Merge only suspicious title/artist fields; preserve every SMTC playback field. | Delivery |
| Implement artist-only recovery with the healthy-title match guard. | Delivery |
| Add `metadataSource`, `sourceTitle`, `sourceArtist`, and `uiaAttempt` to the payload as optional/defaulted fields. | Delivery |
| Respect the feature flag and retry/timeout env configuration. | Delivery |
| Tests: integration tests for suspicious triggers, healthy-track no-op, artist-only recovery, ambiguity, timeout, and cache invalidation. | Quality |

### W3 — Frontend Integration, Diagnostics and Most Played

| Task | Responsibility |
| :--- | :--- |
| Extend the frontend `NowPlaying` type with the new optional metadata-source fields. | Delivery |
| Emit `uia`/`detection` events in `bridgeService` on identity changes; surface attempts in the Debug Terminal. | Delivery |
| Preserve manual-Fix precedence by keying overrides against the original SMTC identity, not the UIA-merged one. | Delivery |
| Ensure a UIA enrichment for the same raw reading does not reset the play session or create a second play. | Delivery |
| Record a play with the recovered artist when UIA resolves before the 30-second threshold; if an unknown-artist play was already recorded, migrate/merge that history entry instead of double-counting. | Delivery |
| Tests: frontend tests for UIA-augmented metadata, override precedence, terminal events, and history attribution before/after 30 seconds. | Quality |

### W4 — Testing and Hardening

| Task | Responsibility |
| :--- | :--- |
| Test the live cursed-song scenarios from spec 17 and the unknown-artist case. | Quality |
| Test sparse/transient trees, duplicate player bars, paused playback, minimized windows, decorated and non-Latin titles. | Quality |
| Prove graceful degradation: no wrong identity when UIA is unavailable and no healthy SMTC overwrite. | Quality |
| Measure performance: no main-poller delay, bounded UIA work, and at most one corrected publication per raw identity. | Quality |
| Document the UIA fallback, feature flag, diagnostics and recovery precedence in `README.md`. | Delivery |

### W5 — Release `0.5.6-rc.1` to the test channel

| Task | Responsibility |
| :--- | :--- |
| Bump `0.5.5-rc.2 → 0.5.6-rc.1` across the version files (`package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`). | Delivery |
| Update `README.md`, `specs/PROJECT_OVERVIEW.MD` and `specs/PROMPTS.md`. | Delivery |
| Tag `v0.5.6-rc.1` and publish through the gated pipeline to `test-latest`. | Delivery |
| Verify the captured live scenarios resolve when UIA is available and that normal SMTC operation is unchanged. | Quality |

---

## 5. Definition of Done

- **W0:** The read-only probe and sanitized fixtures exist for the live player/window states; the `RawViewWalker`/`FindAll` finding is recorded, and the SMTC-side trigger variants are documented and composable with the captured tree.
- **W1:** The UIA worker performs bounded, non-blocking scans with retries, timeout, candidate scoring and duplicate-player handling; COM objects never cross threads.
- **W2:** UIA runs only for suspicious SMTC metadata, including empty/unknown artist; artist-only recovery preserves the healthy title and requires a matching UIA candidate title.
- **W3:** `metadataSource` and the raw SMTC identity fields reach the frontend; UIA attempts are visible in the Debug Terminal; manual Fix overrides win; Most Played attribution is corrected without duplicate sessions.
- **W4:** Captured live scenarios resolve when UIA data is available; sparse/minimized/unavailable trees degrade gracefully with no wrong identity, no main-poller delay and no identity oscillation.
- **W5:** `v0.5.6-rc.1` is published to `test-latest`, docs are updated, and unit + Rust + E2E gates are green.

---

## 6. Technical Notes

### 6.1 Suspicious Metadata Triggers

The exact helper can operate on the SMTC fields (with placeholders normalized):

```rust
fn needs_uia(title: &str, artist: &str, album: &str) -> bool {
    let title = title.trim();
    let artist = artist.trim();
    let album = album.trim();

    title.is_empty()
        || is_placeholder_title(title)
        || (!artist.is_empty() && title.eq_ignore_ascii_case(artist))
        || (!album.is_empty() && title.eq_ignore_ascii_case(album))
        || artist.is_empty()
        || is_placeholder_artist(artist)
}
```

`is_placeholder_artist` covers the same unknown/placeholder family as the frontend sanitizer (`Unknown Artist`, `Artist name`, etc.). A healthy title/artist pair does not call UIA.

### 6.2 Artist-Only Guard

For a healthy title with an unknown artist, accept the UIA artist only when the UIA candidate title matches the SMTC title after normalization (release-noise decoration is allowed). If it does not match, keep `Unknown Artist`.

### 6.3 Retry, Timeout and Cache

- Retry only when the tree is sparse or no confident candidate is found.
- Use 3–5 attempts with backoff such as 100 ms, 250 ms, 500 ms, within a ~2-second total budget.
- Debounce per raw SMTC identity and keep at most one in-flight scan per identity.
- Cache successful reads briefly; invalidate on raw identity change. There is no persistent UIA cache.

### 6.4 Dependencies and Code Paths

- `windows` crate: `Win32_UI_Accessibility` for `IUIAutomation`, `IUIAutomationElement`, `IUIAutomationTreeWalker`, `RawViewWalker`, and `CUIAutomation`.
- Add `Win32_UI_WindowsAndMessaging` and `Win32_System_Threading` only if required for window/process discovery.
- Do not add `UI_UIAutomation` for this COM approach.
- Adapter: `src-tauri/src/bridge/source/windows.rs`; UIA module: `src-tauri/src/bridge/uia.rs` or `source/uia.rs`.

---

## 7. Deferred

- macOS/Linux UIA-equivalent fallbacks (not applicable to those platforms).
- Persistent caching of UIA results across track changes (only the brief per-raw-identity cache is in scope).
- A frontend-to-bridge **failed-lookup recovery probe** (e.g. `POST /uia/probe`): the bridge cannot observe provider outcomes today, so this needs a separate, debounced endpoint design.
- A UI toggle for UIA in Options (the env kill switch is sufficient for this release).
