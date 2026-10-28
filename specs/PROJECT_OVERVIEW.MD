# Lyrics for Amazon Music — Project Overview & Target Architecture
**Standalone app:** Amazon Music Floating Lyrics

---

## 1. Project Context & Objective

The project is a standalone, desktop-style companion for the **Amazon Music** music player. Its goal is to retrieve the lyrics of the song currently playing on Amazon Music — from providers such as **Genius** and **LRCLIB** — and display them in a **floating, resizable window** that sits above the user's workspace.

The app is developed incrementally using **SpecDD (Specification-Driven Development)**, starting from a target architecture (described in this document) and evolving through a phased delivery roadmap.

Two defining requirements shape the architecture:

1. **Provider-Agnostic AI Fallback**: When lyrics are missing from Genius/LRCLIB, the app can synthesize synced lyrics using an AI provider. Rather than being hardwired to a single vendor, this is a **customizable AI placeholder** — a pluggable, OpenAI-compatible adapter configurable by endpoint, model, and API key (in-app and via environment variables). Gemini is one optional adapter, not a dependency.

2. **Desktop-App Track Detection**: Beyond the browser Media Session API (which only detects the Amazon Music *web player* inside the same browser), the app detects songs played in the **Amazon Music desktop app** through a **native companion bridge** that reads OS-level now-playing metadata.

---

## 2. What Is "Lyrics for Amazon Music"

The application connects Amazon Music listeners with lyrics and song meanings from Genius and synced-lyric databases. When a user is playing a track on Amazon Music (web player, desktop app, or mobile), the app detects or searches the track, pulls high-precision timestamped lyrics, fetches Genius annotations/background trivia, and displays everything inside an ultra-sleek, floating translucent glass window that can sit above the workspace.

### Core Pillars

1. **Track Detection (Hybrid)**
   - Automatic detection via the browser `navigator.mediaSession` API and audio listener (Amazon Music **web player**).
   - **Native companion bridge** for the **Amazon Music desktop app** (Windows → System Media Transport Controls; macOS → MediaRemote; Linux → MPRIS over D-Bus) exposed to the UI over a localhost WebSocket/HTTP API.
    - Auto-detect only (no search bar): previously played songs are re-selected from the local **Most Listened** history.

2. **Multi-Provider Lyric Engine**
   - An ordered provider chain — **Genius → LRCLIB** — with accepted-lyrics persistence and a local **Most Listened** play-history store.
   - **LRCLIB** for millisecond-precision, synchronized (LRC) lyrics; **Genius** for rich text, verified annotations, and track trivia.
   - A genuine **"Lyrics not found"** state when the whole chain comes up empty (no fabricated lyrics), plus **per-song thumbs up/down** feedback that persists accepted results locally or advances to the next provider.
   - **Customizable AI fallback adapter** for tracks still missing timestamped metadata — synchronizes lyrics and generates annotations without vendor lock-in.

3. **Docked Lyrics Surface**
   - A single in-app surface (not a floating/draggable window) with a **now-playing header** (album art + title/artist/album), a unified **Options** menu (layout preset, backdrop, appearance: opacity/blur/font/palette, default sync offset), an **Info** panel (artist/song/album details), and a local **Most Listened** view.
   - Instant toggle between **Synchronized Karaoke Mode** (line timing highlighting, auto-scroll, sync-offset fine-tuning alongside the lyrics) and **Full Lyrics Sheet** (clean editorial layout, verse headers, font sizing).

---

## 3. Target Architecture (Layered)

The system is organized into 6 logical layers, designed to run standalone (browser window or packaged desktop app) with optional native companions:

1. **Clients & Channels of Access**
   - Amazon Music Web Player (in-browser detection).
   - Amazon Music Desktop App (detection via the native companion).
    - The main window itself, with the lyrics docked as a single in-app surface (not floating/draggable).
2. **Track Detection & Playback Sync**
   - Browser `navigator.mediaSession` (web player) with play/pause/seek handlers.
   - **Native Companion Bridge**: OS now-playing integration — Windows `GlobalSystemMediaTransportControlsSessionManager` (SMTC), macOS MediaRemote/`nowplaying-cli`, Linux MPRIS D-Bus — publishing track metadata over a localhost endpoint. When multiple sessions exist, it prefers a playing **Amazon Music** session, else the system's current session.
   - Playback timer with `±0.5s` / `±0.1s` sync-offset calibration against the user's exact audio stream.
3. **Lyric Services (Business Logic)**
    - `src/services/lyricsService.ts`: retrieval and LRC parsing (`parseLrc`), and the accepted → provider-chain → saved-AI → AI cascade (`fetchLyrics`, returning `LyricsData | null`), with per-provider adapters under `src/services/providers/` and accepted-lyrics persistence in `src/services/userLyricsStore.ts`. All provider network I/O flows through `src/services/httpClient.ts` (direct-first, bridge `/fetch` fallback).
    - `src/services/playHistoryStore.ts`: local, restart-durable Most Listened play-history (counts a play only after ≥ 30s of native playback); `src/services/settingsStore.ts` persists layout/appearance; `src/services/layoutPresets.ts` defines the docked layout widths.
    - Domain types in `src/types/lyrics.ts`: `Song`, `LyricLine`, `LyricsData`, `GeniusAnnotation`, `AppSettings`, `WindowState`.
4. **Artificial Intelligence Layer (Pluggable)**
   - A **customizable AI placeholder**: provider-agnostic adapter over an OpenAI-compatible chat/completions endpoint.
   - Configurable via environment variables (`AI_PROVIDER_URL`, `AI_MODEL`, `AI_API_KEY`) and an in-app settings panel; no compile-time dependency on any single vendor.
   - Used to synthesize synchronized lyrics and smart annotations when Genius/LRCLIB coverage is missing. Gemini (`@google/genai`) is an optional adapter, not a requirement.
5. **UI & Window Experience**
    - `src/components/NowPlayingHeader.tsx`: the currently playing song with album art, title/artist/album, the detection chip, and the Most Listened toggle + Options menu.
    - `src/components/LyricsPanel.tsx`: the docked lyrics surface (Karaoke / Full Sheet toggle, sync calibration, thumbs feedback, auto-scroll) occupying the former "Live Stream Playback Status" region.
    - `src/components/KaraokeLyricsView.tsx` and `src/components/FullSheetLyricsView.tsx`: the two display modes.
    - `src/components/InfoPanel.tsx`: artist/song/album details, trivia, and annotations from the lyrics provider.
    - `src/components/MostListenedPanel.tsx`: the Hot / Month / Lifetime usage view.
    - `src/components/OptionsMenu.tsx`: the single customization surface (layout, backdrop, appearance, default sync, reset history).
    - `src/components/BackgroundBackdrop.tsx`: decorative backdrops behind the docked surface.
6. **Quality, Packaging & Delivery**
   - Vite build + TypeScript check (`tsc --noEmit`) for the web applet.
   - Native packaging of the companion bridge (Electron or Tauri shell) for desktop-app detection on Windows, macOS, and Linux.
   - Environment-driven configuration honored by AI Studio runtime (`.env` / secrets).

---

## 4. MVP Features (Global Definition of Done)

The project is considered complete when it satisfies the following functional and architectural criteria:

> **Status (Phase 8 close-out):** all criteria below are met and the MVP is delivered as of Phase 8.
>
> **Post-MVP note:** the post-MVP UX redesign (`specs/12_SPEC_POSTMVP-UX-REDESIGN.md`) later replaced the **floating window ergonomics** and **search/quick-input** criteria with a **docked lyrics surface** and an **auto-detect-only** flow; those MVP criteria are retained here as the historical Phase-8 record.

- ✅ **Hybrid track detection** — web-player via `navigator.mediaSession`, desktop-app via the native companion bridge, plus search/quick-input.
- ✅ **Multi-provider lyrics** — LRCLIB synced lyrics, Genius annotations/trivia, and a **provider-agnostic AI fallback** for missing tracks.
- ✅ **Dual display modes** — synchronized karaoke highlighting (auto-scroll, click-to-seek) and full lyrics sheet (verse headers, font sizing, copy).
- ✅ **Floating window ergonomics** — drag anywhere, multi-direction resize, opacity (15–100%) and blur sliders, pin/always-on-top, minimize-to-floating-pill, maximize/presets.
- ✅ **Sync calibration** — `±0.5s` / `±0.1s` offset controls keeping lyrics locked to the exact Amazon Music stream.
- ✅ **AI placeholder configurability** — endpoint/model/key settable via env and in-app; zero coupling to a specific vendor.
- ✅ **Standalone execution** — single-command run locally (`npm run dev`) and buildable for packaging as a desktop companion (`npm run tauri:build` → NSIS + MSI installers).

---

## 5. Delivery Roadmap

| Phase | Deliverable / Milestone |
| :--- | :--- |
| **Phase 1** | Project scaffold: Vite + React + TypeScript + Tailwind, layered structure (types / services / components), and window manager skeleton. |
| **Phase 2** | Core lyric engine: LRC parsing, LRCLIB + Genius retrieval, search with suggestions, curated track database, and fallback generation. |
| **Phase 3** | Floating window UX: draggable/resizable glass window, opacity/blur/pin/minimize/presets, karaoke (click-to-seek, auto-scroll) and full-sheet modes, Genius annotations drawer. |
| **Phase 4** | Playback sync: media-session integration, playback timer, and `±0.5s` offset calibration. |
| **Phase 5** | **Customizable AI placeholder**: provider-agnostic adapter (OpenAI-compatible endpoint, env + in-app config), upgrading the canned fallback into real AI-synthesized synchronized lyrics. |
| **Phase 6** | **Native companion bridge**: OS now-playing detection (Windows SMTC, macOS MediaRemote, Linux MPRIS) exposed over localhost; desktop shell (Electron/Tauri) packaging. |
| **Phase 7** | **Automated testing & verification**: unit/component tests (frontend + Rust core), bridge HTTP/WS integration tests, and a real frontend↔backend E2E suite, targeting ≥ 85% combined line coverage with documented findings. |
| **Phase 8** | Hardening & release: typecheck/lint clean, multi-platform validation, docs, and final demo. |

> **Post-MVP track:** the 8-phase MVP above is complete. Work now continues on the post-MVP backlog catalogued in `specs/08_SPEC_HARDENING.md` §5 (code signing/notarization, auto-update, cross-platform installers, and more). The first post-MVP spec is `specs/09_SPEC_POSTMVP-APP-PACK.md` — **App Packaging for Live Testing** (versioned, self-updating Windows build distributed via GitHub Releases); the second is `specs/10_SPEC_POSTMVP-MIN-PATCH.md` — **Lyrics Fallback & UX Minor Patch** (live Genius source + genuine "Lyrics not found", the multi-provider chain before AI, Amazon Music session prioritization on Windows, and per-song thumbs up/down), landed on `dev` with no version bump or release. The third is `specs/11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md` — **Critical Lyrics Pipeline Fix** (**v0.4.0**): the CORS-free bridge `/fetch` egress proxy, the Genius `response.sections[].hits[]` + multi-container extraction fix, LRCLIB `/api/search` fallback + `429` handling, and the removal of the azlyrics/letras.mus.br/musixmatch scrapers (chain reduced to **Genius → LRCLIB**). The fourth spec, `specs/12_SPEC_POSTMVP-UX-REDESIGN.md` — **Post-MVP UX Redesign** — is implemented on `dev` (no version bump): the search bar, playback controls/scrubber, curated "trending" row, mock Home/Podcasts/Library nav, and floating window are removed; the lyrics are **docked** into the former "Live Stream Playback Status" region; "Genius" is renamed **Info**; all customization is consolidated into **one Options menu** (with AI Options hidden/deferred); a local **Most Listened** view (Hot/Month/Lifetime, ≥ 30s play rule) is added; and the test suite is re-baselined (≥ 85% global + **100% of critical utilities**). The fifth spec, `specs/13_SPEC_POSTMVP-LIVE-CORE-PATCH.md` — **Live-Core Patch: Detection, Metadata & Playback Truth** (**v0.5.1**) — closes the round-2 live-testing defects: the `NowPlaying` payload gains `appId`/`isAmazon`/`albumArt` (real Windows SMTC thumbnail as a size-capped `data:` URL), **Most Listened counts only Amazon Music** (legacy unflagged records excluded), the playback clock clamps only against a **real** duration and free-runs past the 180 s fallback, lyrics loads are **latest-wins** with a cleared panel before each fetch, placeholder metadata is **rejected** (last good track preserved), each provider attempt is logged dev-only with the session **app id** surfaced, and a **manual fix / re-search** control (persisted per track, revertible) is added. The test suite adds Amazon-gating, clock, load-race, sanitization, and override-store coverage and extends the critical-file gate to the playback-clock, latest-request, override-store, and sanitizer modules. The sixth spec, `specs/14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md` — **Lyrics UX, Provider Chain & AI Karaoke Sync** (**v0.5.2**) — closes the round-2 improvement feedback: the lyrics panel header (song name + Karaoke/Full Sheet tabs) stays visible at every layout preset and small window sizes, auto-scroll is container-local (never moves ancestors), and both tabs carry always-visible custom scrollbars; the provider chain is reordered **synced-first** to **`LRCLIB → Lyrica → Genius`** with the new **Lyrica** source (Windows-validated live, hosted default), and a user-triggered **AI karaoke** pipeline converts plain-only tracks via **WASAPI loopback capture → hosted Whisper-class alignment (OpenAI or Hugging Face, auto-detected) → merge → permanent `AI Sync` save** that wins future lookups (endpoint+model persisted, API key session-only). Coverage extends the critical-file gate to the Lyrica adapter, the alignment/merge service, the karaoke-AI config store, and the capture service. The sixth spec, `specs/15_SPEC_POSTMVP-RELEASE-HARDENING.md` — **Release Hardening: Single Instance, Test Update Channel & Packaged-App E2E** (**v0.5.3-rc.1**) — adds the single-instance guard (second launch focuses and exits) with a native busy-port dialog instead of a silent detection-dead state, a dual update channel (rc builds auto-update through the rolling `test-latest` pre-release asset while stable builds keep reading `releases/latest` only), and a packaged-app E2E gate (`scripts/e2e-packaged.ts` via `tauri-driver` + `msedgedriver`, 5 checks) wired in `release.yml` between the draft build and the publish step. The seventh spec, `specs/16_SPEC_POSTMVP-FUZZY-LOOKUP-RELEASE.md` - **Fuzzy Lookup, Local-First Lyrics & Window Geometry** (**v0.5.4**) - closes the third round of live-testing feedback: provider queries and local keys share a pattern-gated normalization pipeline (`(Remastered 2011)`, `- Radio Edit`, `feat. ...` stripped) and candidates must pass a `fastest-levenshtein` + token-set fuzzy identity gate; `fetchLyrics` follows a canonical local-first order (**accepted -> saved AI -> cache -> chain -> live AI**) with a durable (`localStorage`) 20-entry / 7-day lyrics cache written through on saves; thumbs-up, AI-save and Fix overrides key on the normalized identity (with legacy-key dual-read migration) and overrides are consulted on every playback path; and window size/position persist via `tauri-plugin-window-state` with off-screen re-centering when a display disappears. The eighth spec, `specs/17_SPEC_POSTMVP-DIAGNOSTICS-AND-LOOKUP-RECOVERY.md` - **In-App Diagnostics Terminal & Lookup Recovery** (**v0.5.5-rc.2**) - closes the fourth round of live-testing feedback: a 2000-event in-memory Debug Terminal (Ctrl+Shift+D / Options, dev and rc builds only) records the raw bridge reading, metadata admission, track changes, overrides, cache hits, provider requests, gate rejections and chain outcomes, with level/scope/text filters, Clear and a JSON Copy report; readings are never dropped silently (missing/placeholder/duplicate titles are adopted, `title === artist` becomes title-only, the header says "Title not reported - fix to search", and the Fix dialog plus an artist-scoped title memory complete the search); provider requests retry 429/500/502/503/504 with backoff, the chain re-runs once after a transient failure, outcomes are classified as `found | not-found | transient-error | gate-rejected` with a Retry action, and `/api/get` is skipped outside LRCLIB's 1..3600 s duration window; and lookup identity gained Unicode-safe normalization, `feat.` stripping, ordered full/title-only/artist+title variants, known-artist `"Artist - Title"` splitting and a tiered gate. The published `v0.5.5-rc.1` was cut from an incomplete commit; `v0.5.5-rc.2` is the corrected diagnostics/lookup-recovery cut. The ninth spec, `specs/18_SPEC_POSTMVP-UIAUTOMATION-METADATA-FALLBACK.md` - **Windows UIAutomation Metadata Fallback** (**v0.5.6-rc.1**) - adds a confidence-scored UIA recovery source for suspicious SMTC readings (missing/placeholder/duplicate titles, album-in-title, empty/unknown artist): a read-only W0 tree-capture probe and sanitized fixtures; a long-lived, non-blocking UIA worker using `FindAll(TrueCondition)` (the W0 finding that `RawViewWalker` under-reports) with bounded retries/timeout and candidate scoring for duplicate player bars; strict merge precedence (**manual Fix -> UIA -> artist memory -> SMTC**) and an artist-only recovery guard that preserves a healthy title; `metadataSource` / `sourceTitle` / `sourceArtist` / `uiaAttempt` diagnostics; and Most Played attribution that treats a UIA correction as metadata enrichment rather than a new play.
>
> **Release flow:** `dev` is the integration branch (now at version **0.5.6-rc.1**). A long-lived **`staging`** branch carries the in-progress release — it was cut from `dev` and is advanced by merging `dev` → `staging`; CI runs on its pushes. Stable releases are cut from `staging` as `vX.Y.Z` tags and are auto-update candidates via `releases/latest`; `vX.Y.Z-rc.N` tags publish as GitHub **pre-releases**, excluded from `releases/latest`, and are consumed by **rc builds through the rolling `test-latest` channel** (refreshed after every gated publish — the packaged-app E2E must pass before the draft release is flipped to published). Current candidate: **`v0.5.6-rc.1`** (the Windows UIAutomation metadata fallback; first staged candidate was `v0.3.0-rc.1`).

---

## 6. Reference Technology Stack

* **UI & Language:** React 19, TypeScript, Vite, Tailwind CSS, `lucide-react`, `motion`.
* **Lyrics & Annotations Providers:** ordered chain — **Genius → LRCLIB (LRC synced lyrics)** — over a curated local database, with per-song thumbs up/down persistence. All provider network I/O flows through a single egress layer (`httpClient.ts`) that falls back to the bridge `/fetch` proxy when the webview's CORS policy blocks an upstream.
* **Artificial Intelligence (Optional & Pluggable):** provider-agnostic adapter (OpenAI-compatible endpoint), configurable by env (`AI_PROVIDER_URL`, `AI_MODEL`, `AI_API_KEY`); Gemini via `@google/genai` as an optional adapter only.
* **Native Desktop Bridge:** Electron or Tauri shell; Windows System Media Transport Controls (SMTC), macOS MediaRemote, Linux MPRIS (D-Bus).
* **Backend/Serving:** Express (`server` support), `.env` configuration consumed by the AI Studio runtime.
* **Quality & Tooling:** Vite build, `tsc --noEmit` typecheck, Git, `SPECS/implementation_plan` tracking, `PROJECT_OVERVIEW.MD` governance.