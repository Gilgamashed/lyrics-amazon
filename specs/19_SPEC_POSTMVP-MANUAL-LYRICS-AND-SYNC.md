# 19_SPEC_POSTMVP-MANUAL-LYRICS-AND-SYNC.md — Post-MVP: Manual Lyrics & Manual Sync

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)  
**Track:** Post-MVP (follows `specs/18_SPEC_POSTMVP-UIAUTOMATION-METADATA-FALLBACK.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)  
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)  
**Target Release:** `0.5.7-rc.1` (published to `test-latest` channel)

---

## 1. Objective

Add user-authored lyrics as a first-class local source, with an in-app line-sync workflow.

- **Edit / Manual** — an action button beside the view toggle that turns the lyrics surface into a text editor (read-write) and saves locally as `provider: "Manual"`. It reads `Edit` when lyrics content exists and `Manual` when none was found.
- **Manual (Synced)** — a new view button beside `Karaoke (Synced)` that displays the user's own input (when available) using the existing synced-lyrics rendering. `Karaoke` and `Full Sheet` are unchanged.
- **Manual Sync** — stamps line breaks onto the **already-saved, static** manual text while the song plays, then saves the result as a Manual entry.

Manual lyrics outrank every other source, can be deleted (confirmed) or bypassed for one search (Skip), and never leave the device.

The delivery line is **`0.5.7-rc.1`**. Scope is bounded to the manual lyrics store, the editor surface, the `Manual (Synced)` view, the Manual Sync state machine, the lookup-order change, and the release/docs cut. It does not touch provider query/selection logic, SMTC/UIA detection, karaoke-AI alignment, window chrome, AI keys, or release plumbing beyond cutting this rc line.

---

## 2. Context

### 2.1 Feature request (intent, `specs/newfeature.md`)

- Beside `Karaoke` and `Full Sheet`, add an `Edit` button; when no provider lyrics exist it reads `Manual`.
- Manually input songs take priority in the queue.
- Both buttons turn the lyrics window into a text input with Save; saved lyrics show as `Manual` provider.
- Manual/edited lyrics have `Delete` (with confirmation) beside the provider, plus `Skip` to search providers normally.
- When viewing manual or static full-sheet lyrics, show `Manual Sync` with tooltip instructions.
- Sync: as the song progresses, `Space` / `Enter` / `Down` stamps current song time as the current line break, highlights current line and advances; seek/pause/restart re-arms stamping at the new song time; song change aborts.
- One break per line; last write wins.
- Safety net: `Backspace` / `Up` moves to the last set break and seeks playback there (confirmed in scope for v1).
- State machine: `IDLE → SYNCING → PAUSED → ABORTED`.
- Edge cases: window focus loss → `PAUSED`; pause/stall/buffer → `PAUSED`, no stamping while paused; seek forward/backward → `PAUSED`; song change → `ABORTED` with temp-state wipe and pointer reset.

### 2.2 Current status (implemented through spec 18) — verified against the code

- ✅ Canonical local-first order: accepted → saved AI → cache → chain → live AI (`lyricsService.ts:44-70`).
- ✅ Normalized identity keys with legacy dual-read (`userLyricsStore.ts:17-25`).
- ✅ View toggle owns the panel surface (`LyricsPanel.tsx:107-125`); auto-view synced → karaoke else sheet (`App.tsx:282`).
- ✅ `LyricLine.startTimeMs` (`types/lyrics.ts:1-3`), `onSeek` wiring (`LyricsPanel.tsx:289,306`), synced rendering with active-line `glow-text` + auto-follow (`KaraokeLyricsView.tsx:90-92,228`), Debug Terminal, `lookupOutcome`.
- ✅ `lyricsCache` write-through + persistence (`lyricsCache.ts:104-110`) but **no per-song removal** (`:112` clears everything only).
- ✅ `handleSeek` rewrites the app's internal clock anchor only (`App.tsx:212-216`); `applySnapshot` overwrites that anchor from the bridge on every poll tick (~1 s).
- ⬜ No manual store, no `Manual` provider, no editor, no Delete/Skip, no `Manual (Synced)` view, no sync machine.

### 2.3 Key decisions (locked)

| # | Decision |
| :--- | :--- |
| D1 | **Manual outranks thumbs-up.** Order: `manual → accepted → saved AI → cache → chain → live AI`. |
| D2 | One store, one label: manual and edited lyrics share `manualLyricsStore` and `provider: "Manual"`. |
| D3 | **The editor is an action, not a view mode.** `Edit`/`Manual` opens a read-write editor surface; `ViewMode` gains only `"manual"` for the `Manual (Synced)` view. The persisted `viewMode` values stay compatible. |
| D4 | **Sync text is static and already saved.** A sync session operates on the persisted Manual entry; the editor is not writable during a session. Unsaved draft text must be saved (or discarded) before sync starts. |
| D5 | **`Manual (Synced)` shows the user's input** (when a Manual entry exists) using the existing synced-lyrics renderer; `Karaoke`/`Full Sheet` keep the current architecture. |
| D6 | Label rule: `Edit` when lyrics content exists, `Manual` when empty/not-found. |
| D7 | **Delete** removes the Manual entry *and its cached copy* permanently, after confirmation, and re-runs the lookup. **Skip** runs one provider lookup bypassing Manual and the cache, without deleting anything. |
| D8 | Sync keys: `Enter` primary; `Space`/`Down` accepted; `Backspace`/`Up` = pointer back **and** re-arm the local clock/highlight to that break. |
| D9 | `ABORTED` keys on the **raw** identity (`sourceTitle`/`sourceArtist`), never on `currentSong.id` (which changes on a spec-18 UIA enrichment). |
| D10 | Version line `0.5.7-rc.1` to `test-latest`; docs updated in the same pass. |

**Out of scope:** provider ranking/selection, detection/SMTC/UIA, karaoke-AI capture/align, play-history scoring (except no double-count when Manual lyrics are saved), Options toggles, macOS/Linux packaged validation, word-level karaoke, lyric import/export.

---

## 3. Design Decisions

### 3.1 Manual is the first source

`fetchLyrics` gains a Manual stage before the accepted stage. A Manual hit reports `lookupOutcome: "found"` with `provider: "Manual"`.

**Skip is explicit.** `FetchLyricsOptions` gains `skipManual?: boolean`. Skip calls `fetchLyrics(song, { skipManual: true, useCache: false })`: the Manual stage and the cache read are bypassed for that one request, the Manual entry is **not** deleted, and the provider result is not written back to the cache (so the cached Manual copy is not overwritten). The `Manual (Synced)` / `Edit` entry stays available to return to the user's lyrics.

### 3.2 The editor is an overlay surface, the Manual view is a view mode

- `ViewMode` becomes `'karaoke' | 'sheet' | 'manual'`. `manual` renders the `Manual (Synced)` view and is only offered when a Manual entry exists for the current track ("if available"); otherwise the button is hidden or disabled.
- The editor is **not** a persisted view mode: it is an in-panel surface with a draft buffer, opened by `Edit`/`Manual` and closed by Save or Cancel. Auto-view (`App.tsx:282`) must not switch the surface while the editor is open or a sync session is active.
- The `Manual (Synced)` view reuses the existing synced renderer (`KaraokeLyricsView` behavior: active-line `glow-text`, auto-follow, click-to-seek) fed with the Manual entry's `syncedLyrics`; when the entry has no timestamps it renders as static text.

### 3.3 The editor

- Read-write textarea prefilled with the current Manual entry (or empty).
- Validation: non-empty after trimming, a documented line cap and a documented character cap; Save is disabled otherwise.
- Save writes the Manual entry (normalized identity key, legacy dual-read) with `provider: "Manual"`, write-throughs to the lyrics cache, and reloads the panel through the normal path — **without resetting the play session** (same discipline as the spec-18 enrichment path) so a play is never awarded twice.
- While a sync session is active the editor is **read-only**; the `Edit`/`Manual` action is disabled with the reason "sync in progress".

### 3.4 Delete and Skip

- **Delete** (confirmed, beside the provider readout): removes the Manual entry **and evicts the cached copy** (a new `removeCachedLyrics(song)` in `lyricsCache.ts`; the cache is otherwise write-through, so eviction is mandatory or the deleted lyrics keep rendering), then re-runs the lookup so provider lyrics reappear. Confirmation is explicit.
- **Skip**: one provider lookup bypassing Manual and the cache; nothing is deleted. `Manual (Synced)` / `Edit` remain available to go back.

### 3.5 Manual Sync state machine

The text source is the **persisted Manual entry** (D4).

| State | Meaning | Exit |
| :--- | :--- | :--- |
| `IDLE` | Lyrics loaded, audio not running, nothing recorded | user starts → `SYNCING` |
| `SYNCING` | Audio playing, awaiting keypresses | pause/blur/seek → `PAUSED`; song change/cancel → `ABORTED` |
| `PAUSED` | Playback or capture interrupted; **no timestamps accepted** | playback resumes → `SYNCING` (re-armed at the current song time); song change/cancel → `ABORTED` |
| `ABORTED` | Song changed or user cancelled; temporary timestamps wiped, pointer reset to index 0, clean unsynced lyrics displayed | new song → `IDLE` |

Rules:

- `Enter` (primary), `Space`, `Down` stamp `currentTimeMs` onto the current line and advance the pointer/highlight.
- **Last write wins per line**: re-stamping a line replaces its timestamp.
- `Backspace` / `Up` move the pointer back to the last stamped line **and** re-arm the local clock and highlight to that break.
- **Seek truth (corrected):** the app has no transport control over Amazon Music — `handleSeek` (`App.tsx:212-216`) only moves the app's internal anchor, which the next SMTC poll overwrites. `Backspace`/`Up` therefore re-arms **the app's clock/highlight**, and the app keeps that override for a short, documented window (or applies it as a user-seek offset) so it is not snapped back immediately. The external player is never moved, and the DoD must not claim it is.
- Saving a sync session persists `syncedLyrics` on the Manual entry (`provider: "Manual"`), so the `Manual (Synced)` view renders it with highlights.
- Starting a sync session requires a saved Manual entry. From a static full sheet without one, `Manual Sync` offers to seed a Manual entry from the visible plain lyrics, then starts.

### 3.6 Edge cases mapped to observable signals

The app does **not** own the media session, so `onPause`/`onStalled`/`onBuffering` are not available; the edges are anchored on what the bridge actually reports.

| Requested edge | Observable signal used | Rule |
| :--- | :--- | :--- |
| User loses window focus | webview `blur`; optionally the Tauri window focus event (`capabilities/default.json` grants only `core:default` — confirm or add `core:window:allow-is-focused`) | → `PAUSED`; no timestamps accepted while unfocused |
| Song paused / interrupted | `nowPlaying.isPlaying === false`, or `isPlaying` true while the position does not advance (stall proxy) | → `PAUSED`; on resume, re-arm at the current song time |
| User advances / rewinds | position delta beyond `MANUAL_SYNC_SEEK_THRESHOLD_MS` (new constant, mirroring `playHistoryStore.MAX_STEP_MS = 2500`) | → `PAUSED`; pointer re-arms at the new song time |
| Currently played song changed | **raw** identity (`sourceTitle`/`sourceArtist`) change | → `ABORTED`: wipe temporary timestamps, pointer → 0, stop recording, show the new song's clean unsynced lyrics |

### 3.7 Key scoping and conflicts

- Sync keys are handled **only** in `SYNCING`, with `preventDefault()` (Space/arrows would otherwise scroll the panel).
- The editor is never focused during a sync session, so `Enter` cannot insert a newline; the editor is read-only then.
- The sync handler must not conflict with the existing Ctrl+Shift+D terminal toggle (spec 17).
- `Thumbs up` is hidden/disabled for `provider: "Manual"` content so a Manual copy is never duplicated into the accepted store (where Delete could not remove it).

### 3.8 Diagnostics, privacy and coverage

- Debug Terminal events for manual save/delete/skip and every sync state transition (`manual` scope).
- Manual content is **local only**: it is never sent to providers, the AI endpoint, or any network path.
- The new modules (`manualLyricsStore`, the sync state machine) join the critical-file list in `scripts/coverage-report.ts` at the 100% line gate.

---

## 4. Work Packages

### 4.1 W1 — Manual Lyrics Store & Lookup Priority

| Task | Responsibility |
| :--- | :--- |
| Add `src/services/manualLyricsStore.ts` — `lyrics-amazon:manual-lyrics:v1`, normalized `identityKey` + legacy raw dual-read, `get/save/clear`, quota/disabled-storage-safe, write-through to the cache. | Delivery |
| Add `removeCachedLyrics(song)` to `lyricsCache.ts` (per-song eviction) for Delete. | Delivery |
| Prepend the Manual stage to `fetchLyrics`; add `skipManual?: boolean` to `FetchLyricsOptions`; a Manual hit reports `found` + `provider: "Manual"`. | Delivery |
| Add `"Manual"` to the `LyricsData.provider` union (`types/lyrics.ts:49`). | Delivery |
| Tests: CRUD, key normalization/migration, priority over accepted/saved/cache/chain, `skipManual` bypass, Delete eviction (no stale cache hit), Skip non-destructive, corrupt/quota storage. | Quality |

### 4.2 W2 — Editor Surface, `Manual (Synced)` View, Delete & Skip

| Task | Responsibility |
| :--- | :--- |
| Add the `Manual (Synced)` view button beside `Karaoke (Synced)`; extend `ViewMode` with `"manual"`; reuse the synced renderer for the Manual entry (static when untimed). | Delivery |
| Add the `Edit`/`Manual` **action** button and the read-write editor surface with Save/Cancel, validation (non-empty, line/char caps) and save-through the normal path without resetting the play session. | Delivery |
| Add `Delete` (confirmed) beside the provider readout and `Skip` beside it; gate the editor while a sync session is active. | Delivery |
| Hide/disable thumbs-up for `provider: "Manual"`. | Delivery |
| Debug Terminal events for manual save/delete/skip. | Delivery |
| Tests: label rule, Manual view visibility, save/load priority, editor validation, Delete-confirm + cache eviction + re-lookup, Skip non-destructive, thumbs-up suppression, auto-view suppression while editing. | Quality |

### 4.3 W3 — Manual Sync State Machine

| Task | Responsibility |
| :--- | :--- |
| `Manual Sync` entry (tooltip with brief instructions) when viewing manual lyrics or a static full sheet; requires a saved Manual entry (offer to seed one from the visible plain lyrics). | Delivery |
| Implement `IDLE/SYNCING/PAUSED/ABORTED` with `Enter/Space/Down` stamping, `Backspace/Up` pointer-back + local re-arm, last-write-wins per line, current-line highlight. | Delivery |
| Apply the pause/blur/seek/song-change rules from §3.6 (raw-identity abort). | Delivery |
| Save persists `syncedLyrics` on the Manual entry; the `Manual (Synced)` view then renders with highlights. | Delivery |
| Tests: key handling and scoping, last-write-wins, pause/resume re-arm, seek handling, focus loss, abort on raw-identity change, editor read-only during sync, save shape, local re-arm window. | Quality |

### 4.4 W4 — Testing & Hardening

| Task | Responsibility |
| :--- | :--- |
| Unit/component/E2E for W1–W3; no identity oscillation; no extra fetches on the same-song enrichment; spec-18 invariants preserved. | Quality |
| Graceful degradation: empty save rejected, corrupt store ignored, sync abort clean, Manual unavailable → normal provider flow unchanged. | Quality |
| Add the new modules to the critical-file coverage gate; keep the combined ≥85% gate green. | Quality |
| Document behavior, keys, precedence, the `Manual (Synced)` view and the new storage key in `README.md` (including the **nine** versioned `localStorage` keys). | Delivery |

### 4.5 W5 — Release `0.5.7-rc.1` to the test channel

| Task | Responsibility |
| :--- | :--- |
| Bump `0.5.6-rc.1 → 0.5.7-rc.1` across `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`. | Delivery |
| Update `README.md`, `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`. | Delivery |
| Tag `v0.5.7-rc.1`, publish through the gated pipeline to `test-latest`. | Delivery |
| Verify Manual priority, editor/Delete/Skip, the `Manual (Synced)` view, a Manual Sync save, and unchanged normal SMTC/provider operation. | Quality |

---

## 5. Definition of Done

- **W1:** Manual lyrics load first with `provider: "Manual"`; Delete permanently removes the entry **and** its cached copy; Skip searches providers without deleting anything.
- **W2:** `Edit`/`Manual` opens a read-write editor (disabled during sync) with validation; the `Manual (Synced)` view shows the user's input when available; the editor surface survives auto-view switches.
- **W3:** `Manual Sync` stamps the saved static text with `Enter/Space/Down` (last write wins), `Backspace/Up` returns to the last break and re-arms the local clock/highlight, pause/blur/seek → `PAUSED` (no stamping), raw-identity change/cancel → `ABORTED` with clean state, and the saved result renders as synced Manual lyrics.
- **W4:** Unit + Rust + E2E green; coverage gate green with the new critical modules at 100%; no detection, lookup or play-count regression.
- **W5:** `v0.5.7-rc.1` published to `test-latest`; docs updated.

---

## 6. Technical Notes

### 6.1 Lookup order and Skip

```ts
if (startFromIndex === 0) {
  if (!options?.skipManual) {
    const manual = getManualLyrics(song); // manual -> accepted -> saved AI
    if (manual) { report('found', 'Manual'); return manual; }
  }
  const accepted = getAcceptedLyrics(song);
  ...
}
```

Skip = `fetchLyrics(song, { skipManual: true, useCache: false })`; the Manual entry and its cached copy are left untouched and the provider result is not written to the cache.

### 6.2 Delete must evict the cache

`saveManualLyrics` write-throughs to `lyricsCache` (`lyricsCache.ts:104-110`), and the cache persists to `localStorage`. Without `removeCachedLyrics(song)` the deleted Manual lyrics keep rendering. Delete therefore: evict the cache entry → clear the store entry → re-run the lookup.

### 6.3 Seek semantics

`handleSeek` (`App.tsx:212-216`) rewrites the app's anchor, and `applySnapshot` overwrites it from the bridge on the next poll (~1 s). Manual Sync therefore treats the re-arm as an **app-side** action: pointer + karaoke highlight + a bounded user-seek override window. The external Amazon Music playback position is not controllable and is never claimed to be.

### 6.4 View/editor contract

| Surface | Kind | Persisted | Notes |
| :--- | :--- | :--- | :--- |
| `Karaoke (Synced)` | view (`"karaoke"`) | yes | unchanged |
| `Full Sheet` | view (`"sheet"`) | yes | unchanged |
| `Manual (Synced)` | view (`"manual"`) | yes | shown only when a Manual entry exists |
| `Edit` / `Manual` | action (editor overlay) | no | draft buffer; read-only while syncing |

Auto-view (`App.tsx:282`) is suppressed while the editor is open or a sync session is active.

### 6.5 Abort key

Abort on the **raw** identity (`sourceTitle`/`sourceArtist`, absent → the SMTC title/artist), never on `currentSong.id` (which changes when spec 18's UIA enrichment merges a title/artist for the same track).

### 6.6 Dependencies and code paths

No new runtime dependency. Frontend only: `src/services/manualLyricsStore.ts`, `src/services/manualSync.ts` (state machine), `src/components/ManualLyricsView.tsx` (reuses the synced renderer), `src/components/ManualLyricsEditor.tsx`, `src/components/LyricsPanel.tsx`, `src/App.tsx`, `src/types/lyrics.ts`, `src/services/lyricsService.ts`, `src/services/lyricsCache.ts`, `src/services/debugConsole.ts`, `scripts/coverage-report.ts`. No bridge/Rust changes are required by this spec.

---

## 7. Deferred

- Rich-text / markdown lyric editing.
- Word-level manual sync.
- Import/export of manual lyrics.
- Options-menu toggle for sync keys or Manual Sync.
- Cloud sync of manual lyrics.
- Controlling the external player's transport from the app.
