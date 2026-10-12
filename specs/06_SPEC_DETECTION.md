# 06_SPEC_DETECTION.md — Phase 6: Native Companion Bridge (Track Detection)

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Phase:** 6 of 8 (see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD`)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Deliver hybrid track detection for the Amazon Music **desktop app** through a native companion bridge: a Tauri v2 (Rust-native) app that reads OS-level now-playing metadata (Windows SMTC first; macOS MediaRemote/`nowplaying-cli`, Linux MPRIS/`playerctl`) and publishes it over a **localhost WebSocket + HTTP** endpoint — which the floating-lyrics UI consumes to auto-detect the currently playing desktop track, complementing the existing browser Media Session (web-player) detection.

## 2. Context

This is Phase 6 of the 8-phase roadmap described in `specs/PROJECT_OVERVIEW.MD` (§5: "**Native companion bridge**: OS now-playing detection (Windows SMTC, macOS MediaRemote, Linux MPRIS) exposed over localhost; desktop shell (Electron/Tauri) packaging"). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (implemented):** Phase 6 is delivered on Windows; the browser side is complemented by the native bridge:

- A Tauri v2 shell (`src-tauri/`) hosts the existing web UI; the Rust core (`src-tauri/src/bridge/`) serves the localhost HTTP + WebSocket bridge on `127.0.0.1:48765`.
- Windows SMTC detection (`windows-rs`) polls the current media session once per second; macOS (`nowplaying-cli`) and Linux (`playerctl`) adapters implement the same `NowPlayingSource` trait (best-effort; runtime validation deferred to Phase 8).
- The UI consumes the bridge through `src/services/bridgeService.ts`, maps `NowPlaying` into `Song`/playback state, auto-loads lyrics, and shows a source indicator (Desktop native vs Browser Media Session) in `src/components/AmazonMusicBar.tsx`.
- Existing foundations: the Vite/React/TypeScript UI models the playing track (`Song`, `currentTimeMs`, `WindowState`) and wires lyrics retrieval; browser Media Session detection (Amazon Music **web player**) works (Phase 4). The "Auto-Detect" control remains the Phase 4 browser Media Session flag; desktop detection is indicated separately by the bridge source badge.

**Key decisions:**

- **Desktop shell:** Tauri v2 hosts the existing web UI.
- **Bridge:** Rust-native in the Tauri core — the localhost HTTP + WebSocket server and per-OS adapters live in Rust (single binary, no Node runtime shipped).
- **Transport:** localhost **WebSocket push** of now-playing events plus a simple **HTTP GET** metadata/health endpoint.
- **OS coverage:** **Windows-first** (SMTC via `windows-rs`) with macOS (MediaRemote/`nowplaying-cli`) and Linux (MPRIS over D-Bus via `playerctl`) adapters behind a common interface; full cross-platform validation is deferred to Phase 8.

**Out of scope for this phase:** changes to browser Media Session detection (Phase 4), the pluggable AI adapter (Phase 5), and release/hardening, packaging polish, and multi-platform validation (Phase 8) — none may be introduced here per `00_AI-SAFE.md`.

## 3. Tasks and Responsibilities

### 3.1 Documentation & Delivery

| Task | Responsibility |
| :--- | :--- |
| Scaffold a Tauri v2 desktop app whose Rust core hosts the existing Vite web UI. | Delivery |
| Implement a Rust-native bridge in the Tauri core exposing a localhost HTTP + WebSocket server (fixed, documented port). | Delivery & Quality |
| Define a `NowPlaying` payload schema (title, artist, album, durationMs, positionMs, isPlaying, source). | Delivery |
| Implement Windows SMTC detection (`windows-rs` `GlobalSystemMediaTransportControlsSessionManager`) emitting now-playing changes. | Delivery & Quality |
| Implement macOS (MediaRemote/`nowplaying-cli`) and Linux (MPRIS/`playerctl`) adapters behind a common interface (best-effort this phase). | Delivery |
| Push now-playing changes over WebSocket and expose the current track via HTTP GET. | Delivery |
| Connect the UI to the bridge, map metadata into `Song`/playback state, and auto-load lyrics for the detected desktop track. | Delivery & Quality |
| Add a detection-source indicator distinguishing Browser (web player) from Desktop (native bridge). | Delivery |
| Degrade gracefully when the bridge is unavailable, leaving the browser Media Session path unaffected. | Quality |
| Document setup (Rust toolchain, `cargo tauri dev`, bridge port) in the README; update `.env.example` if a port variable is added. | Documentation |
| Keep `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

### 3.2 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Do not implement Phase 8 features (release hardening, packaging polish, multi-platform validation) or re-do Phases 4–5. | Code Safety (per `00_AI-SAFE.md`) |
| Do not add unnecessary dependencies; keep the bridge minimal. | Quality |
| Keep typecheck/lint clean for the web app (`npm run lint`); format/lint Rust (`cargo fmt`, `cargo clippy`). | Quality |
| Bind the bridge to **localhost only**; introduce no secrets; `.env*` remains ignored. | Code Safety |

## 4. Definition of Done

- [x] A Tauri v2 desktop shell hosts the existing web UI.
- [x] A Rust-native bridge in the Tauri core runs a localhost HTTP + WebSocket server.
- [x] The bridge defines and serves a `NowPlaying` metadata schema (title/artist/album/durationMs/positionMs/isPlaying/source).
- [x] Windows SMTC detection is implemented (`windows-rs`) and emits now-playing updates.
- [x] macOS (MediaRemote/`nowplaying-cli`) and Linux (MPRIS/`playerctl`) adapters exist behind a common interface.
- [x] Now-playing changes are pushed over WebSocket and retrievable via HTTP GET.
- [x] The UI connects to the bridge, maps metadata to `Song`/playback state, and auto-loads lyrics for the detected desktop track.
- [x] A detection-source indicator distinguishes Browser (web player) from Desktop (native bridge).
- [x] The UI degrades gracefully when the bridge is unavailable (browser Media Session path unaffected).
- [x] The bridge binds to localhost only and introduces no secrets; `.env*` stays ignored.
- [x] The README documents building/running the Tauri app and the bridge port.
- [x] `npm run lint` (`tsc --noEmit`) passes with no errors.
- [x] No Phase 8 features were introduced during this phase.

## 5. Deferred / TODO

- **Cross-platform validation & packaging:** full macOS/Linux verification, code signing/notarization, and auto-update are deferred to Phase 8 (Hardening & Release).
- **Detection discovery:** auto-discovery of the bridge (vs. a fixed documented port) and richer transport controls (seek/playback commands back to the desktop app) are not part of this phase.
