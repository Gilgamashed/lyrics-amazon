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
   - Amazon Music live track quick-input bar and full song/artist search with instant search suggestions.

2. **Multi-Provider Lyric Engine**
   - An ordered provider chain — **Genius → LRCLIB → azlyrics → letras.mus.br → musixmatch** — over the curated local database.
   - **LRCLIB** for millisecond-precision, synchronized (LRC) lyrics; **Genius** for rich text, verified annotations, and track trivia.
   - A genuine **"Lyrics not found"** state when the whole chain comes up empty (no fabricated lyrics), plus **per-song thumbs up/down** feedback that persists accepted results locally or advances to the next provider.
   - **Customizable AI fallback adapter** for tracks still missing timestamped metadata — synchronizes lyrics and generates annotations without vendor lock-in.

3. **Floating Lyrics Window Experience**
   - A frosted-glass window with custom translucency/opacity slider, background blur control, pinned overlay mode, corner/edge resize handles, minimize-to-floating-pill, and full-screen view.
   - Instant toggle between **Synchronized Karaoke Mode** (word/line timing highlighting, auto-scroll, click-to-seek, sync-offset fine-tuning) and **Full Lyrics Sheet** (clean editorial layout, verse headers, font sizing, copy tool).

---

## 3. Target Architecture (Layered)

The system is organized into 6 logical layers, designed to run standalone (browser window or packaged desktop app) with optional native companions:

1. **Clients & Channels of Access**
   - Amazon Music Web Player (in-browser detection).
   - Amazon Music Desktop App (detection via the native companion).
   - The floating lyrics HUD window itself (draggable, resizable, translatable).
2. **Track Detection & Playback Sync**
   - Browser `navigator.mediaSession` (web player) with play/pause/seek handlers.
   - **Native Companion Bridge**: OS now-playing integration — Windows `GlobalSystemMediaTransportControlsSessionManager` (SMTC), macOS MediaRemote/`nowplaying-cli`, Linux MPRIS D-Bus — publishing track metadata over a localhost endpoint. When multiple sessions exist, it prefers a playing **Amazon Music** session, else the system's current session.
   - Playback timer with `±0.5s` / `±0.1s` sync-offset calibration against the user's exact audio stream.
3. **Lyric Services (Business Logic)**
   - `src/services/lyricsService.ts`: unified search (`searchTracks`), retrieval and LRC parsing (`parseLrc`), and the accepted → curated → provider-chain → saved-AI → AI cascade (`fetchLyrics`, returning `LyricsData | null`), with per-provider adapters under `src/services/providers/` and accepted-lyrics persistence in `src/services/userLyricsStore.ts`.
   - `src/services/curatedTracks.ts`: curated local database of trending/tracked songs for instant offline results.
   - Domain types in `src/types/lyrics.ts`: `Song`, `LyricLine`, `LyricsData`, `GeniusAnnotation`, `WindowState`, `WindowPreset`.
4. **Artificial Intelligence Layer (Pluggable)**
   - A **customizable AI placeholder**: provider-agnostic adapter over an OpenAI-compatible chat/completions endpoint.
   - Configurable via environment variables (`AI_PROVIDER_URL`, `AI_MODEL`, `AI_API_KEY`) and an in-app settings panel; no compile-time dependency on any single vendor.
   - Used to synthesize synchronized lyrics and smart annotations when Genius/LRCLIB coverage is missing. Gemini (`@google/genai`) is an optional adapter, not a requirement.
5. **UI & Window Experience**
   - `src/components/AmazonMusicBar.tsx`: currently playing track controls, search with auto-suggestions, audio progress bar, sync calibration.
   - `src/components/FloatingLyricsWindow.tsx`: draggable/resizable glass window with pointer-based dragging, multi-edge resizing, opacity/blur controls, pin, minimize-to-pill, and presets.
   - `src/components/KaraokeLyricsView.tsx` and `src/components/FullSheetLyricsView.tsx`: the two display modes.
   - `src/components/GeniusAnnotationsPanel.tsx`: trivia, behind-the-lyrics facts, and highlighted verse explanations.
   - `src/components/BackgroundDesktop.tsx`: the mock desktop canvas beneath the translucent glass.
6. **Quality, Packaging & Delivery**
   - Vite build + TypeScript check (`tsc --noEmit`) for the web applet.
   - Native packaging of the companion bridge (Electron or Tauri shell) for desktop-app detection on Windows, macOS, and Linux.
   - Environment-driven configuration honored by AI Studio runtime (`.env` / secrets).

---

## 4. MVP Features (Global Definition of Done)

The project is considered complete when it satisfies the following functional and architectural criteria:

> **Status (Phase 8 close-out):** all criteria below are met and the MVP is delivered as of Phase 8.

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

> **Post-MVP track:** the 8-phase MVP above is complete. Work now continues on the post-MVP backlog catalogued in `specs/08_SPEC_HARDENING.md` §5 (code signing/notarization, auto-update, cross-platform installers, and more). The first post-MVP spec is `specs/09_SPEC_POSTMVP-APP-PACK.md` — **App Packaging for Live Testing** (versioned, self-updating Windows build distributed via GitHub Releases); the second is `specs/10_SPEC_POSTMVP-MIN-PATCH.md` — **Lyrics Fallback & UX Minor Patch** (live Genius source + genuine "Lyrics not found", the multi-provider chain before AI, Amazon Music session prioritization on Windows, and per-song thumbs up/down), landed on `dev` with no version bump or release. The third is `specs/11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md` — **Critical Lyrics Pipeline Fix** (**v0.4.0**): the CORS-free bridge `/fetch` egress proxy, the Genius `response.sections[].hits[]` + multi-container extraction fix, LRCLIB `/api/search` fallback + `429` handling, and the removal of the azlyrics/letras.mus.br/musixmatch scrapers (chain reduced to **Genius → LRCLIB**). A fourth spec, `specs/12_SPEC_POSTMVP-UX-REDESIGN.md`, is written but not yet implemented.
>
> **Release flow:** `dev` is the integration branch (now at version **0.4.0**). A long-lived **`staging`** branch carries the in-progress release — it was cut from `dev` and is advanced by merging `dev` → `staging`; CI runs on its pushes. Stable releases are cut from `staging` as `vX.Y.Z` tags; `vX.Y.Z-rc.N` tags publish as GitHub **pre-releases** for manual testing only (the updater reads `releases/latest`, which excludes pre-releases). First staged candidate: **`v0.3.0-rc.1`**.

---

## 6. Reference Technology Stack

* **UI & Language:** React 19, TypeScript, Vite, Tailwind CSS, `lucide-react`, `motion`.
* **Lyrics & Annotations Providers:** ordered chain — **Genius → LRCLIB (LRC synced lyrics)** — over a curated local database, with per-song thumbs up/down persistence. All provider network I/O flows through a single egress layer (`httpClient.ts`) that falls back to the bridge `/fetch` proxy when the webview's CORS policy blocks an upstream.
* **Artificial Intelligence (Optional & Pluggable):** provider-agnostic adapter (OpenAI-compatible endpoint), configurable by env (`AI_PROVIDER_URL`, `AI_MODEL`, `AI_API_KEY`); Gemini via `@google/genai` as an optional adapter only.
* **Native Desktop Bridge:** Electron or Tauri shell; Windows System Media Transport Controls (SMTC), macOS MediaRemote, Linux MPRIS (D-Bus).
* **Backend/Serving:** Express (`server` support), `.env` configuration consumed by the AI Studio runtime.
* **Quality & Tooling:** Vite build, `tsc --noEmit` typecheck, Git, `SPECS/implementation_plan` tracking, `PROJECT_OVERVIEW.MD` governance.