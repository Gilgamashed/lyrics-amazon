# 20_SPEC_POSTMVP-MANUAL-SYNC-UX-PATCH.md — Post-MVP: Manual Sync UX Patch

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)  
**Track:** Post-MVP (follows `specs/19_SPEC_POSTMVP-MANUAL-LYRICS-AND-SYNC.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)  
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)  
**Target Release:** `0.5.7-rc.2` (published to `test-latest` channel)

---

## 1. Objective

Give Manual Sync its own lyrics surface so the user can see exactly where they are while stamping.

- **Dedicated sync surface** — while a sync session runs, the body renders the working line list instead of a normal viewer.
- **No search in sync** — the `Search within lyrics...` / `Copy Sheet` bar is absent from that surface.
- **Pointer highlight** — the line the next stamp will land on is highlighted and advances with `Enter` / steps back with `Backspace`.
- **Centered auto-scroll** — the highlighted line is kept in the middle of the view (per the Auto-Scroll setting).
- **Locked surface** — the Karaoke / Full Sheet / Manual toggle is disabled for the duration of the session, so the sync surface cannot be navigated away from.

The delivery line is **`0.5.7-rc.2`**. Scope is bounded to the sync-mode presentation: a new view component, the `LyricsPanel` routing/lock, the `App` prop wiring, tests, and the release/docs cut. It does not change the sync state machine, the re-arm window, the seeding rule, the lookup order, providers, detection, or release plumbing beyond cutting this rc line.

---

## 2. Context

### 2.1 Live feedback (intent)

After `v0.5.7-rc.1`:

1. Remove the lyrics search feature while in sync mode.
2. Highlight the current line while in sync mode.
3. Auto-scroll, centering on the highlighted line.
4. Cut `0.5.7-rc.2`.

### 2.2 Current status (implemented through spec 19) — verified against the code

- ✅ `Manual Sync` starts a session on the persisted Manual text and forces `viewMode: 'manual'` (`App.tsx:486-511`).
- ✅ The session is a pure `IDLE/SYNCING/PAUSED/ABORTED` reducer with `pointer`, per-line `startTimeMs` and `rearmAtMs` (`manualSync.ts`).
- ✅ Stamp keys (`Enter`/`Space`/`Down`) and step-back keys (`Backspace`/`Up`) are wired while `state === 'syncing'` (`App.tsx:614-644`).
- ⬜ The body has **no sync-specific renderer**: `LyricsPanel` always renders `ManualLyricsView`, which chooses between two normal viewers (`LyricsPanel.tsx:378-393`).
- ⬜ An **unsynced** Manual entry (the normal case when a session starts) renders `FullSheetLyricsView`, so the `Search within lyrics...` input and `Copy Sheet` button are on screen (`FullSheetLyricsView.tsx:97-118`).
- ⬜ A **previously synced** Manual entry (re-sync) renders `KaraokeLyricsView`, whose highlight follows the playback clock/offset, not `session.pointer` (`KaraokeLyricsView.tsx:54-64`).
- ⬜ The view toggle stays clickable during a session, so the user can navigate away from the sync state entirely.
- ⬜ `LyricsPanel` receives only a pre-formatted `syncStatus` string and a boolean `syncActive`; it never sees the session's `lines`/`pointer`.

### 2.3 Key decisions (locked)

| # | Decision |
| :--- | :--- |
| D1 | **The body search bar is removed while syncing.** The `Search within lyrics...` input and `Copy Sheet` are absent from the sync surface. The footer **Skip** (one-shot provider search) stays available. |
| D2 | **The view toggle is locked while a session runs.** `Karaoke` / `Full Sheet` / `Manual` are disabled until the session is saved, cancelled or aborted. |
| D3 | **The highlight is the sync pointer**, never the playback clock or the `syncOffsetMs` calibration. |
| D4 | **Centering respects the Auto-Scroll setting.** With it checked (default) the highlighted line is centered on every pointer change; unchecked leaves the view still. |
| D5 | The reducer, the last-write-wins rule, the app-side re-arm window, the seeding rule and the lookup order are **unchanged**. |
| D6 | **Delete is disabled while syncing** (it would destroy the entry the session is working on); Skip, Save and Cancel stay available. |
| D7 | Version line `0.5.7-rc.2` to `test-latest`; docs updated in the same pass. |

**Out of scope:** click-to-seek or line re-targeting inside the sync surface, finding a line mid-session, editing the text during a session, word-level sync, provider/ranking changes, detection/SMTC/UIA, karaoke-AI, play-history scoring.

---

## 3. Design Decisions

### 3.1 A dedicated renderer, not a variant of an existing view

`KaraokeLyricsView` derives its active line from `startTimeMs <= currentTimeMs`, and `FullSheetLyricsView` owns the search/copy bar. Neither can express "the line the next keypress will stamp", so the sync surface is a new component:

`src/components/ManualSyncLyricsView.tsx`

- Props: `lines: ManualSyncLine[]`, `pointer: number`, `state: ManualSyncState`, `status: string`, `fontSize: FontSize`, `autoScroll: boolean`.
- Renders **every** session line (not just the stamped ones), so the user always sees the remaining text.
- Keeps the `data-testid="manual-sync-status"` strip and adds a compact key hint.
- Contains no search input, no copy action and no click handler.

Because the surface is chosen by the panel, removing the search feature is a structural consequence rather than a conditional inside `FullSheetLyricsView` — the normal Full Sheet keeps its search bar untouched.

### 3.2 Highlight semantics

| Line position | Look |
| :--- | :--- |
| `index === pointer` | Active: `glow-text`, bold, `scale-[1.02]`, cyan tint; `aria-current="true"`, `data-active="true"` |
| `startTimeMs !== null` (already stamped) | Past: dimmed, with an `m:ss.d` time chip |
| otherwise | Upcoming: neutral |

The pointer is clamped by the reducer (`Math.min(index + 1, lines.length - 1)`), so repeated `Enter` on the last line re-stamps the same row and the highlight stays put. The stamp itself does not move the view unless the pointer changed.

### 3.3 Centering

Reuse the container-local scroll math already proven in `KaraokeLyricsView`:

```
target = activeLine.offsetTop - container.clientHeight / 2 + activeLine.offsetHeight / 2
container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
```

`scrollIntoView` is **not** used: it walks every scrollable ancestor and would push the panel header/footer out of view (spec 14 §3.3). The effect runs on `[pointer, autoScroll]`, so it centers on session start and after every stamp or step-back, and does nothing when `autoScroll` is off.

### 3.4 Panel routing and lock

- `LyricsPanel` gains `syncSession?: ManualSyncSession | null`; `syncActive` and the status text are derived from it, so the two existing props (`syncStatus`, `syncActive`) are removed rather than kept in sync by hand.
- In the `manual` branch: `syncActive && syncSession` → `ManualSyncLyricsView`; otherwise the existing `ManualLyricsView` (which still shows the `Aborted - timestamps discarded` strip after a cancel).
- The three view buttons get `disabled={syncActive}`. `Edit` is already disabled during a session.
- Footer: `Delete` is disabled, `Skip` stays enabled, `Manual Sync` stays disabled, and `Save`/`Cancel` remain the session exits.

### 3.5 App wiring

`App.tsx` passes `syncSession={syncSession}` instead of the derived string/boolean. No reducer, handler or effect changes: `stampManualSync`/`stepBackManualSync` already return a new session object, so the pointer reaches the view through normal state.

---

## 4. Work Packages

### 4.1 W1 — Specification

| Task | Responsibility |
| :--- | :--- |
| Add this spec; link it from `README.md` and `specs/PROJECT_OVERVIEW.MD`. | Delivery |

### 4.2 W2 — Sync Surface

| Task | Responsibility |
| :--- | :--- |
| Add `src/components/ManualSyncLyricsView.tsx` with the status strip, the full line list, pointer highlight, stamped time chips and the key hint. | Delivery |
| Implement container-local centered auto-scroll on `[pointer, autoScroll]`, with no `scrollIntoView`. | Delivery |
| No search input, no copy action, no click handler on the surface. | Delivery |

### 4.3 W3 — Panel & App Wiring

| Task | Responsibility |
| :--- | :--- |
| Add the `syncSession` prop; derive `syncActive`/status; route the `manual` branch to the sync view while active. | Delivery |
| Disable the view toggle and Delete while `syncActive`; keep Skip, Save, Cancel. | Delivery |
| Pass the session from `App.tsx`; remove the now-redundant `syncStatus`/`syncActive` props. | Delivery |

### 4.4 W4 — Tests

| Task | Responsibility |
| :--- | :--- |
| `ManualSyncLyricsView.test.tsx`: all lines render, only the pointer line is active, the highlight follows pointer changes, `scrollTo` receives the centered offset, `autoScroll={false}` does not scroll, the status and chips render, no search input. | Quality |
| `LyricsPanel.test.tsx`: a session renders the sync scroller with no `Search within lyrics...`; the toggle and Delete are disabled; the aborted session falls back to the Manual view. | Quality |
| `App.test.tsx`: starting a session shows the sync list with line 1 current; `Enter` makes line 2 current. | Quality |
| `e2e/app.spec.ts`: on the seeded manual song, start a session, assert the sync scroller is visible, the search bar is absent and the first line is current. | Quality |

### 4.5 W5 — Release `0.5.7-rc.2` to the test channel

| Task | Responsibility |
| :--- | :--- |
| Bump `0.5.7-rc.1 → 0.5.7-rc.2` across `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`. | Delivery |
| Update `README.md`, `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`. | Delivery |
| Tag `v0.5.7-rc.2`, publish through the gated pipeline to `test-latest`. | Delivery |
| Verify the sync surface on an installed build: highlight advances/steps back, centering follows, no search bar, toggle locked. | Quality |

---

## 5. Definition of Done

- **W2:** A running session renders the working line list; the pointer line is highlighted; stamped lines show their timestamp; the search input and Copy action are absent.
- **W3:** The highlight follows `Enter`/`Backspace`; the highlighted line is centered when Auto-Scroll is on and stays still when it is off; the view toggle and Delete are disabled for the session; the normal Manual, Karaoke and Full Sheet views are unchanged.
- **W4:** Unit + Rust + E2E green; coverage gate green; no reducer, lookup or play-count regression.
- **W5:** `v0.5.7-rc.2` published to `test-latest`; docs updated.

---

## 6. Technical Notes

### 6.1 Why a new component

`ManualLyricsView` is the `Manual (Synced)` view: it renders saved lyrics with the playback-driven renderer. Sync mode is a different contract (pointer-driven, draft timings), so mixing the two would require a second highlight rule inside both existing viewers. The new component keeps `KaraokeLyricsView` and `FullSheetLyricsView` untouched.

### 6.2 Component contract

| Surface | Kind | Persisted | Highlight source |
| :--- | :--- | :--- | :--- |
| `Karaoke (Synced)` | view (`"karaoke"`) | yes | playback clock |
| `Full Sheet` | view (`"sheet"`) | yes | none (search/copy bar) |
| `Manual (Synced)` | view (`"manual"`) | yes | playback clock, Manual entry |
| Sync surface | transient (`syncActive`) | no | `session.pointer` |

### 6.3 Dependencies and code paths

Frontend only, no new runtime dependency: `src/components/ManualSyncLyricsView.tsx` (new), `src/components/LyricsPanel.tsx`, `src/App.tsx`, the three test files, `e2e/app.spec.ts`, `scripts/coverage-report.ts` (only if a critical-file entry is needed). No Rust/bridge changes.

---

## 7. Deferred

- Clicking a line to move the pointer / seek during a session.
- Jumping to the pointer from a "Follow" affordance in sync mode.
- Editing or deleting individual lines mid-session.
- Word-level manual sync.
- A dedicated sync-mode keyboard-remap option.
