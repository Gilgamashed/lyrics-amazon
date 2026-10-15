# 12_SPEC_POSTMVP-UX-REDESIGN.md — Post-MVP: Purposeful UI Redesign & Usage Insights

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows `specs/11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Rebuild the app's UI around its **actual purpose** — a companion that shows the lyrics of whatever Amazon Music is currently playing — by removing the chrome that testers found useless, docking the lyrics into a single coherent surface, consolidating every customization into one Options menu, and adding a **Most Listened** usage view. The redesign also re-baselines the test suite and coverage targets for the new reality and records pending deficiencies as GitHub issues.

This is a **UI/UX and engineering-hygiene** spec: it changes **layout, information architecture, and local usage tracking** only. It does **not** change lyrics retrieval (owned by `11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md`), detection, the bridge, or the AI fallback behavior.

## 2. Context

This is the **fourth post-MVP spec**, following `specs/11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md`. Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

### 2.1 Live-tester feedback (verbatim intent)

Testers reported that the UX is "mostly useless stuff for our purposes" and asked for:

- The **currently playing song to be clearly visible at the top** (with the **currently-playing album art**).
- **Remove the search bar** (the app is auto-detect only).
- **Remove the playback buttons and scrubber** (the app does not play audio).
- **Remove the "Amazon Music Trending" bar and the pre-loaded (curated) lyrics.**
- **Remove the mock Amazon Music bar's Home / Podcasts / Library navigation.**
- **Stop floating** the lyrics window; **place it inside the main window.**
- Move **sync options and lyric calibration** to **where the lyrics are displayed**.
- Rename **"Genius" → "Info"**, showing **artist information, song trivia, and album details** (when available from the lyrics provider).
- The **"Live Stream Playback Status"** panel is useless — **place the lyrics window there instead**.
- Move **"Window layout presets"** into the **Options menu**.
- Move **"Window backdrop" customization** into the **Options menu**.
- In general, **move everything customizable into the Options menu.**
- **AI Options "does nothing"** — defer it.
- **Research providers for artist/song information** — defer until options are researched.
- **Register pending technical deficiencies / identifiable improvements as GitHub issues.**
- **Reorganize the test suite** to satisfy the new reality.
- **Minimum coverage: 85% global and 100% of critical utilities.**
- Add a **Most Listened** tab: **Hot** (most listened in the last 5 days), **Month** (ranked for that month), and **Lifetime** (lifetime play count). **Only count a play when at least 30 seconds have elapsed.**

### 2.2 Current status (the surfaces this spec replaces)

- `src/App.tsx:80-83` boots straight into a **curated** track (`CURATED_TRACKS[0]`) with **pre-loaded** curated lyrics (`CURATED_LYRICS_DATA['espresso-sabrina-carpenter']`).
- `src/components/AmazonMusicBar.tsx` renders the **search bar** (lines 179-250), **play/pause** + **scrubber** (252-279), **sync calibration** popup (281-347), the **AI Options** menu (349-350), and the **"Amazon Music Trending"** curated row (354-378).
- `src/components/BackgroundDesktop.tsx` renders the **mock Amazon Music nav** (Home / Podcasts / Library, lines 70-86), the **"Live Stream Playback Status"** panel with the **Window Layout Presets** (109-135), and the floating **Backdrop** switcher pill (186-221), with presets defined at lines 25-54.
- `src/components/FloatingLyricsWindow.tsx` positions the window **`fixed`** with pointer drag/resize (lines 74-150, 208-238), a **minimize-to-pill** state (168-191), a **"Genius"** drawer toggle (310-324), and a **Glass Window Controls** dropdown (326-443) for opacity/blur/font/theme.
- `src/components/OptionsMenu.tsx` currently exposes **only AI fallback settings** (provider URL / model / key) — settings that testers confirm **do nothing** today.

### 2.3 Key decisions (accepted for this spec)

- **Auto-detect only:** the **search bar** is removed; the app follows the detected Amazon Music track. Manual re-selection is available through the **Most Listened** history (not a search box).
- **Docked lyrics:** the lyrics window is **no longer floating/draggable**; it is a normal panel inside the main layout, replacing the **"Live Stream Playback Status"** region. The overlay/pin/minimize-to-pill affordances are removed.
- **One Options menu:** a single menu owns **all customization** — window/layout presets, backdrop, appearance (opacity/blur/font/theme), sync calibration default, and the (deferred) AI section. Nothing customizable is scattered in the main view.
- **Sync controls live with the lyrics:** offset/calibration controls render in the lyrics panel header/footer.
- **"Genius" → "Info":** the drawer is renamed and repurposed to show **artist / song / album** information sourced from the lyrics provider when available, and a graceful empty state otherwise. Broader artist-info providers are **deferred** (research first).
- **AI Options deferred:** the inert AI settings are **removed/hidden** from the UI (no behavior change to the fallback code); reactivation is a later spec.
- **Most Listened:** a new local, restart-durable **play-history store** scoring a play only after **≥ 30 seconds** of playback, surfaced as **Hot (last 5 days) / Month / Lifetime** tabs.
- **Delivery:** patch the `dev` branch only — **no version bump, no tag, no release, no CI-secret changes**.

**Out of scope for this spec:** lyrics retrieval, CORS/egress, provider chain, Genius parsing, LRCLIB behavior (all owned by `11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md`); detection and the native bridge; karaoke/full-sheet rendering semantics; AI fallback activation; live artist-info provider integration; releases/version bumps.

## 3. Tasks and Responsibilities

### 3.1 Decluttered Single-Surface Layout

| Task | Responsibility |
| :--- | :--- |
| Rework the top header to make the **currently playing song prominently visible**, including the **currently-playing album art**, title, artist, and album. | Delivery |
| **Remove the search bar** and its auto-suggest dropdown (`AmazonMusicBar.tsx`); the app is auto-detect only. | Delivery |
| **Remove the playback controls and scrubber** (`AmazonMusicBar.tsx`). | Delivery |
| **Remove the "Amazon Music Trending" curated row** and stop booting into **pre-loaded curated lyrics** (`App.tsx`); the app shows the detected track or a neutral waiting/not-found state. | Delivery |
| **Remove the mock Amazon Music Home / Podcasts / Library navigation** (`BackgroundDesktop.tsx`). | Delivery |
| **Dock the lyrics window** inside the main layout (no `position: fixed`, no drag/resize handles, no pin/minimize-to-pill) and **replace the "Live Stream Playback Status" panel** with it. | Delivery |
| Keep the **album art** as the visual anchor of the now-playing header (non-functional decorative imagery is removed). | Delivery |

### 3.2 Sync Controls with the Lyrics

| Task | Responsibility |
| :--- | :--- |
| Move the **sync calibration** controls (`±0.5s` / `±0.1s`, reset) from the top bar into the **lyrics panel** (header/footer). | Delivery |
| Keep the existing offset semantics (`syncOffsetMs`) and karaoke behavior unchanged. | Quality |

### 3.3 "Info" Panel (renamed from Genius)

| Task | Responsibility |
| :--- | :--- |
| Rename the **"Genius"** drawer to **"Info"** throughout the window. | Delivery |
| Show **artist information, song trivia, and album details** from data the lyrics provider already supplies (`LyricsData.annotations` / `trivia` / `trackInfo`), with a clean empty state when nothing is available. | Delivery & Quality |
| Make no claim of live artist metadata; do not fabricate content. | Quality |

### 3.4 Unified Options Menu

| Task | Responsibility |
| :--- | :--- |
| Expand `OptionsMenu.tsx` into the **single customization surface**: **window/layout presets**, **backdrop theme**, **appearance** (opacity, blur, font size, theme palette), and **default sync offset**. | Delivery |
| Remove the scattered controls: the in-window **Glass Window Controls** dropdown (`FloatingLyricsWindow.tsx`) and the floating **Backdrop** pill (`BackgroundDesktop.tsx`) move into Options. | Delivery |
| **Hide/remove the inert AI Options** section from the UI (deferral); leave the AI service code untouched. | Delivery |
| Persist Options selections locally (localStorage) so the chosen layout/appearance survive restarts. | Quality |

### 3.5 Most Listened (Play-History & Ranking)

| Task | Responsibility |
| :--- | :--- |
| Add a local, restart-durable **play-history store** keyed by song (title + artist) recording play counts and timestamps. | Delivery |
| Score a play **only when at least 30 seconds** of the track have elapsed (no score on skips). | Delivery & Quality |
| Surface a **"Most Listened"** view with three tabs: **Hot** (most listened in the **last 5 days**), **Month** (ranking for the current month), and **Lifetime** (all-time counts). | Delivery |
| Allow selecting a song from the history to re-display its lyrics (replaces the removed search bar). | Delivery |
| Provide a lightweight way to **reset** the history. | Quality |

### 3.6 GitHub Issue Registration

| Task | Responsibility |
| :--- | :--- |
| File the pending **technical deficiencies and identifiable improvements** surfaced by this work as **GitHub issues** (via `gh`), each with a clear title, rationale, and acceptance criteria. | Delivery & Documentation |
| Include the carried-over deferred items (AI API-key security, headless scraping for WAF-blocked sources, live macOS/Linux adapter validation, updater signing-key lifecycle, MSI auto-update, code signing/notarization, telemetry) plus any new ones found here. | Documentation |
| Link the filed issues from `specs/PROMPTS.md` so the backlog is traceable; do **not** implement them in this spec. | Documentation |

### 3.7 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| **Reorganize the test suite** to the new reality: update or remove component tests for the deleted search/playback/trending/backdrop/preset/floating surfaces, and add tests for the docked layout, the Info panel, the unified Options menu, and Most Listened. | Quality |
| Enforce coverage: **≥ 85% global** and **100% of critical utilities** (explicitly: `lrcParser`, the lyrics pipeline/chain/egress, the play-history store and its ≥30s scoring rule). | Quality |
| Keep every existing gate green: `npm run lint`, `npm run build`, `npm run test`, `npm run coverage:report` (≥ 85% combined), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run test:e2e`, `npm run smoke`, `npm run bridge:smoke`. | Quality |
| Limit changes to UI/UX, options consolidation, usage tracking, and tests — no retrieval, detection, bridge, or AI-behavior changes. | Quality |
| Introduce no secrets; `.env*` stays ignored; new state is local-only (localStorage). | Code Safety (per `00_AI-SAFE.md`) |
| Do **not** bump the app version, tag, or publish; do **not** implement the §5 deferred items. | Code Safety |
| Keep the README, `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

## 4. Definition of Done

- [ ] The **currently playing song and album art** are prominently visible at the top of the app.
- [ ] The **search bar**, **playback controls/scrubber**, **"Amazon Music Trending" row**, **pre-loaded curated lyrics**, and **mock Home/Podcasts/Library nav** are removed.
- [ ] The lyrics window is **docked in the main layout** (not floating/draggable) and occupies the former **"Live Stream Playback Status"** region.
- [ ] **Sync calibration** controls render **with the lyrics**, with unchanged offset semantics.
- [ ] The **"Genius"** control is renamed **"Info"** and shows **artist/song/album** info when the provider supplies it, with a graceful empty state (no fabricated content).
- [ ] A single **Options menu** owns all customization (presets, backdrop, appearance, default sync); the scattered in-window settings and backdrop pill are gone; **AI Options is hidden/deferred**.
- [ ] A **Most Listened** view offers **Hot (5 days) / Month / Lifetime** tabs and counts a play **only after ≥ 30 seconds**; history persists across restarts and can be reset; songs can be re-selected from it.
- [ ] The test suite is **reorganized** for the new layout and removed surfaces; **coverage ≥ 85% global** and **100% of the named critical utilities**.
- [ ] Pending **technical deficiencies/improvements are filed as GitHub issues** and linked from `specs/PROMPTS.md`.
- [ ] All existing quality gates pass (lint, build, Vitest, coverage ≥ 85%, fmt, clippy, Rust tests, E2E, `smoke`, `bridge:smoke`).
- [ ] No secrets are committed; the README and `specs/PROJECT_OVERVIEW.MD` stay consistent.
- [ ] No version bump, tag, or release was produced; no §5 deferred items were introduced.

## 5. Deferred / TODO

- **Live artist/song-information providers** (biography, discography, album metadata services): research the available options first; this spec only surfaces provider-supplied info under the **Info** panel.
- **AI fallback activation & UI**: the inert AI Options are hidden here; wiring a usable, well-scoped AI experience is a later spec (see `05_SPEC_AIFALLBACK.md` §5 and `11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md` §5).
- **Cross-device sync of Most Listened** and richer analytics — local-only for now.
- **Advanced theming/layout customization** beyond the consolidated Options (presets, backdrop, appearance).
- **Packaged-app E2E (`tauri-driver`)** and **visual regression** of the redesigned layout — still parked (see `08_SPEC_HARDENING.md` §5).
- All items registered as GitHub issues (§3.6) remain open backlog and are **not** implemented here.
