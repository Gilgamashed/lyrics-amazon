# Lyrics for Amazon Music — Floating Lyrics Companion

A standalone, desktop-style companion that retrieves synchronized lyrics and Genius annotations for songs currently playing on **Amazon Music** and displays them in a floating, translucent, draggable, and resizable glass window.

- **Lyrics providers:** an ordered chain — **Genius → LRCLIB (synchronized LRC) → azlyrics → letras.mus.br → musixmatch** — over a curated local database and an optional AI fallback. A genuine **"Lyrics not found"** state is shown only when the whole chain comes up empty.
- **Playback sync:** click-to-seek, auto-scroll, and `±0.5s` / `±0.1s` offset calibration.
- **Dual display modes:** Synchronized Karaoke (synced results) and Full Lyrics Sheet (plain-only results).
- **Per-song feedback:** thumbs up persists the accepted lyrics locally; thumbs down advances to the next provider.
- **Window experience:** opacity/blur sliders, pin-to-top, minimize-to-pill, resize handles, and window presets.

> Status: Phase 8 (Hardening & Release) — **MVP complete**; post-MVP packaging (`specs/09_SPEC_POSTMVP-APP-PACK.md`) and the lyrics/UX minor patch (`specs/10_SPEC_POSTMVP-MIN-PATCH.md`) are implemented on `dev`. See `specs/PROJECT_OVERVIEW.MD` for the roadmap and `specs/00_AI-SAFE.md` for the SpecDD scope rules.

## Prerequisites

- [Node.js](https://nodejs.org/) (npm included)
- For the native desktop shell / companion bridge:
  - [Rust](https://rustup.rs/) stable toolchain (`stable-x86_64-pc-windows-msvc` on Windows)
  - On Windows: MSVC C++ build tools (Visual Studio Build Tools or VS with the "Desktop development with C++" workload) and the WebView2 runtime (preinstalled on Windows 10/11; otherwise install the Evergreen runtime)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables by copying the example file and filling in your keys:

   ```bash
   copy .env.example .env.local
   ```

   Required for AI-powered lyrics fallback:

   - `GEMINI_API_KEY` — Gemini API key (AI Studio injects it at runtime from secrets).
   - `APP_URL` — the URL where the applet is hosted (used for self-referential links and API endpoints).
   - `VITE_AI_PROVIDER_URL` — OpenAI-compatible base URL for the provider-agnostic AI fallback (e.g. `https://api.openai.com/v1`).
   - `VITE_AI_MODEL` — model name sent to that endpoint (e.g. `gpt-4o-mini`).

   The AI **API key is never read from env** (that would expose it in the client bundle). Enter it in the in-app **AI Options** menu — see [AI Lyric Fallback](#ai-lyric-fallback).

   The bridge URL is optional: `VITE_BRIDGE_URL` overrides the native bridge base URL (default `http://127.0.0.1:48765`).

   Secrets stay local — `.env*` files are git-ignored (only `.env.example` is tracked).

## Run

```bash
npm run dev
```

The app boots at `http://localhost:3000`.

To run the native desktop shell **with the companion bridge** (Tauri v2, Rust core):

```bash
npm run tauri:dev
```

This starts the Vite dev server, compiles the Rust core, opens the desktop window, and serves the track-detection bridge on `http://127.0.0.1:48765` (WebSocket at `ws://127.0.0.1:48765/ws`, snapshot at `GET /now-playing`, health at `GET /health`). The bridge binds to **localhost only**.

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the Vite dev server (port 3000). |
| `npm run build` | Build the production bundle into `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Typecheck with `tsc --noEmit`. |
| `npm run clean` | Remove `dist/` and `server.js`. |
| `npm run tauri` | Tauri CLI passthrough. |
| `npm run tauri:dev` | Run the Tauri desktop shell + native bridge in dev mode. |
| `npm run tauri:build` | Build the Tauri desktop app. |
| `npm run bridge:smoke` | Hit the running bridge over HTTP + WebSocket. |
| `npm run test` | Run the Vitest unit/component suites (172 tests). |
| `npm run test:coverage` | Run Vitest with the v8 coverage provider. |
| `npm run coverage:report` | Combined FE + Rust coverage aggregation (gate: ≥ 85% lines). |
| `npm run test:e2e` | Build UI + bridge, run the Playwright E2E suite (8 tests). |

## Project Structure

```
src/
  types/       Domain types (Song, LyricLine, LyricsData, WindowState, ...)
  services/    Lyric engine (provider chain retrieval, LRC parsing, curated tracks, feedback/bridge clients)
  services/providers/  Ordered lyrics sources (Genius, LRCLIB, azlyrics, letras.mus.br, musixmatch)
  components/  UI (FloatingLyricsWindow, KaraokeLyricsView, FullSheetLyricsView, ...)
src-tauri/
  src/bridge/  Rust-native companion bridge (axum HTTP + WebSocket, per-OS now-playing adapters)
  src/         Tauri shell (lib.rs, main.rs)
specs/
  PROJECT_OVERVIEW.MD   Project overview & 8-phase roadmap
  00_AI-SAFE.md         SpecDD scope-restriction guideline
  0N_SPEC_*.md          Per-phase specifications
  PROMPTS.md            AI prompt & decision history
```

## Lyrics Providers & Feedback

`fetchLyrics(song, options?)` resolves lyrics through an ordered cascade and returns `LyricsData | null` (`null` only when the entire chain yields nothing):

1. **User-accepted** — a result previously saved with thumbs up (`src/services/userLyricsStore.ts`, `localStorage`, `title|artist` key).
2. **Curated** local database.
3. **Provider chain** — **Genius → LRCLIB → azlyrics → letras.mus.br → musixmatch** (`src/services/providers/*`). Each provider self-times-out via `AbortController` and degrades to the next on error/block/miss, so playback is never blocked. Genius uses the **public search endpoint** (`/api/search/song?q=…`) to match a song, then retrieves its lyrics; the other sources use their public pages.
4. **Saved AI** results (`provider: "AI Sync"`).
5. **Live AI fallback** (see below).

- **Sync semantics:** the chain prefers the first **synchronized** result and keeps the first **plain-only** result as a fallback. Synchronized results drive **Karaoke**; plain-only results render in **Full Sheet** mode (the window auto-switches view mode accordingly).
- **Not found:** when curated + all providers + AI return nothing, the window shows **"Lyrics not found"**. The previous fabricated sample-lyrics fallback has been removed from the automatic path.
- **Thumbs up:** persists the winning result locally (survives restarts, per `title|artist`) and is preferred on later lookups. **Thumbs down:** advances to the next provider in the chain; once exhausted it falls through to AI/not-found.

## Lyrics Cache

Recently played song lyrics are cached **in memory** (no persistence) to avoid re-fetching from the provider chain on repeat plays.

- **Scope:** `fetchLyrics` results only (recently played song data); search results are not cached.
- **Key:** normalized `title|artist`.
- **Bounded:** max 20 entries (LRU-style eviction of oldest on overflow).
- **TTL:** entries expire after 7 days.
- **Bypass:** `fetchLyrics(song, { useCache: false })` skips both cache lookup and write; `fetchLyrics(song, { startFromIndex })` starts mid-chain (used by thumbs down).
- Created in `src/services/lyricsCache.ts`; exports `getCachedLyrics`, `setCachedLyrics`, `clearLyricsCache`, `getCacheStats`.

## AI Lyric Fallback

When a track has no coverage in the curated database or any provider in the chain, the app can synthesize synchronized lyrics and annotations through a **provider-agnostic** adapter over any **OpenAI-compatible** `chat/completions` endpoint.

- **Configuration:** endpoint and model are resolved from the **AI Options** menu (top bar) first, then from `VITE_AI_PROVIDER_URL` / `VITE_AI_MODEL`. A Google Gemini model is an option, not a requirement.
- **API key:** entered in the **AI Options** menu and held **in memory for the session only** — it is never written to disk, env, or the client bundle. It is sent only to the provider you configure.
- **Requests:** issued directly from the browser via `fetch` to `${providerUrl}/chat/completions`. Some providers may reject cross-origin requests (CORS) — if so, run the app behind a proxy for that provider.
- **Persistence:** AI-generated results (`provider: "AI Sync"`) are saved **permanently in `localStorage`** (keyed by `title|artist`, no expiry) and reused on repeat plays. Use **Clear** in the AI Options menu to remove them.
- **Fallback:** if the provider is unconfigured, unreachable, times out, or returns malformed data, the app degrades to the genuine **"Lyrics not found"** state without blocking playback (fabricated lyrics are no longer produced).

> Security note: keeping a built-in key out of the client would require a server-side proxy (the key never reaches the browser). This is intentionally deferred — see `specs/05_SPEC_AIFALLBACK.md` §5.

## Native Companion Bridge (Desktop Detection)

The Amazon Music **desktop app** is detected by a Rust-native bridge hosted in the Tauri core (single binary, no Node runtime shipped). It reads OS-level now-playing metadata and publishes it on localhost:

- **Windows (this phase):** SMTC via `windows-rs` `GlobalSystemMediaTransportControlsSessionManager`, polled once per second (MTA COM, session title/artist/album, timeline position/duration, playback status). When several media apps are running, the bridge **prefers a playing Amazon Music session**, and otherwise falls back to the system's current session (behavior-neutral when only one session exists). The macOS/Linux adapters mirror the same preference structurally.
- **macOS / Linux (best-effort, code-complete):** `nowplaying-cli` (MediaRemote) and `playerctl` (MPRIS) adapters behind a common `NowPlayingSource` interface; they compile and pass their fixture suites on macOS/Ubuntu in CI, but live-session validation on real hardware is a post-MVP item.
- **Transport:** `GET /now-playing` (current snapshot), `GET /health`, and `GET /ws` — a WebSocket that pushes every change. All on `127.0.0.1:48765`, localhost only.
- **Payload:** `NowPlaying { source, title, artist, album, durationMs, positionMs, isPlaying }` (`camelCase` JSON).
- **UI behavior:** when the bridge is connected, the detected track is mapped into the existing `Song`/playback state and lyrics load through the normal `fetchLyrics` cascade; position/play state are kept in sync. When the bridge is offline, the client keeps reconnecting with backoff and the browser Media Session path continues to work unchanged.
- **Indicator:** the top bar shows **Desktop (native)** when the bridge is connected, or **Browser (Media Session)** otherwise.

## Packaging & Release

Produce the installable desktop app (Windows, built in Phase 8; versioned and wired for live testing in the post-MVP packaging spec `specs/09_SPEC_POSTMVP-APP-PACK.md`):

```bash
npm run tauri:build
```

- Requires the prerequisites above (Rust/MSVC toolchain, WebView2 runtime).
- Because `cargo` is a native binary, run it with the Rust toolchain on `PATH` (e.g. `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"` on PowerShell) — the Tauri CLI shells out to `cargo metadata`.
- Build artifacts land under `src-tauri/target/release/bundle/`:

  | Artifact | Path | Size (0.2.1) |
  | :--- | :--- | ---: |
  | NSIS installer | `bundle/nsis/Amazon Music Floating Lyrics_0.2.1_x64-setup.exe` | 3.23 MiB |
  | MSI installer | `bundle/msi/Amazon Music Floating Lyrics_0.2.1_x64_en-US.msi` | 4.67 MiB |

- The installed app runs the UI and the embedded companion bridge together; on launch the bridge serves `GET /health` and `GET /now-playing` on `127.0.0.1:48765` (verified against the Phase 8 release build — `npm run bridge:smoke` reports **PASS**).
- Installers are **unsigned** (no code-signing certificates in this project); Windows SmartScreen may warn when installing.
- `bundle.createUpdaterArtifacts` is enabled, so each build also emits updater signature files (`*-setup.exe.sig`, `*.msi.sig`) and the release pipeline publishes a `latest.json` manifest for the in-app updater. Signing uses a minisign keypair managed only as CI secrets (`TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD`) — independent of Windows code signing.
- Cross-platform installers (macOS `.dmg`/`.app`, Linux `.rpm`/`.deb`/AppImage) are not produced yet — the macOS/Ubuntu CI matrix validates that frontend + Rust core build and test cleanly on those OSes.

### Branching & Staging

- **`dev`** — integration branch; every change lands here first and is validated by CI. Currently carries version **0.3.0**.
- **`staging`** — long-lived release-candidate branch where the in-progress version is staged (cut from `dev`, advanced by merging `dev` → `staging`). CI runs on its pushes too.
- **`vX.Y.Z` tags** — cut from `staging` for a stable release; the tag workflow publishes a normal GitHub Release and the in-app updater offers it.
- **`vX.Y.Z-rc.N` tags** — pre-releases for manual testing only. Any tag containing `-` publishes as a GitHub **pre-release** (e.g. `v0.3.0-rc.1`); the updater only reads `releases/latest`, so pre-releases are never offered automatically.

### Install for Testing

- **Download:** the Windows NSIS installer (latest release, e.g. `Amazon Music Floating Lyrics_0.2.1_x64-setup.exe`) from the project's [Releases page](https://github.com/Gilgamashed/lyrics-amazon/releases) (the updatable artifact of record; the `.msi` is kept as a secondary manual install).
- **Install:** run the installer, then launch **Amazon Music Floating Lyrics**.
- **SmartScreen (unsigned build):** Windows may show *"Windows protected your PC"* — click **More info** → **Run anyway**.
- **Auto-update:** on launch the app checks the release endpoint; when a newer **signed** build exists it prompts you to **Update**, downloads and installs it, then relaunches. When offline or the endpoint is unreachable it stays quiet and the app keeps working. (Verified: an installed `0.2.0` updated in-app to `0.2.1`.)
- **Minimum requirements:** Windows 10/11 (x64) with the WebView2 runtime (preinstalled on current Windows).

## CI (GitHub Actions)

A workflow (`.github/workflows/ci.yml`) runs on every push to `dev` and `staging` and on pull requests:

- **`quality-gates`** (Windows runner): `tsc --noEmit` lint, production build, 172 Vitest tests, the combined ≥ 85% coverage gate, `cargo fmt --check`, `cargo clippy --all-targets`, 38 Rust tests, and the 8-test Playwright E2E suite (system Chrome is preinstalled on the runner — no bundled Chromium download).
- **`platform-matrix`** (macOS + Ubuntu runners): `npm ci`, lint, build, and `cargo test` — the multi-platform validation cover (Ubuntu installs the Tauri system dependencies first).
- The workflow is intentionally **secrets-free** (public runners, no signing) and caches the npm and Cargo build caches between runs.

A second workflow (`.github/workflows/release.yml`) runs when a `v*` tag is pushed (e.g. `v0.2.0` or a pre-release `v0.3.0-rc.1`) on a `windows-latest` runner: it installs Node/Rust, runs lint + the Vitest suite, then builds and publishes a **GitHub Release** via `tauri-apps/tauri-action` containing the NSIS installer, the MSI, the updater `.sig` artifacts, and `latest.json`. Tags containing `-` are marked as GitHub **pre-releases** and excluded from `releases/latest`, so they are not auto-update candidates. It is the only workflow that uses secrets (the updater signing key) and is scoped to `contents: write`.

## Testing

Implemented in Phase 7 (`specs/07_SPEC_TESTING.md`). Three layers:

- **Frontend (Vitest + jsdom + Testing Library):** `npm run test` runs 172 tests across provider-chain, service, component/state, and `App` suites. Covers LRC parsing, the lyric/AI/cache/bridge services, the ordered provider chain + per-provider extraction, the not-found state, thumbs feedback persistence, the playback state machine, network resiliency (timeouts, non-OK, malformed payloads), and UI contracts.
- **Rust core (`cargo test`):** 38 tests in `src-tauri/src` — `NowPlaying` serde, metadata parsers (macOS `nowplaying-cli` / Linux `playerctl` fixtures run on Windows), the Amazon Music session-preference helpers, sanitizers, the poller, and axum `/health`, `/now-playing`, `/ws` integration incl. localhost-only CORS.
- **E2E (Playwright):** `npm run test:e2e` builds the UI and the real bridge binary, spawns the bridge with a test-only mock now-playing source, and drives **system Chrome** (`channel: 'chrome'`; the bundled Chromium download is unreliable in this environment) through the connected and degraded paths — boot into the curated Espresso track, Desktop (native) badge, track change via the bridge, unknown-track mapping, HTTP/WebSocket contract, and fall-back to Browser (Media Session) when the bridge is killed.

**Coverage policy:** combined line coverage across frontend and Rust must be ≥ **85%** (hard gate). Aggregation runs fresh Vitest coverage plus `cargo llvm-cov --json` in `scripts/coverage-report.ts`; it exits non-zero on failure. Exclusions (spec-approved, enforced): `src/main.tsx`, `*.test.ts(x)`, `src/test/**`, `src-tauri/src/main.rs`, `src-tauri/build.rs`, `src-tauri/gen/**`. Latest result: **90.13%** combined (FE 90.69%, Rust 89.18%) — see `specs/07_SPEC_TESTING.md` §6.

**E2E bridge mock:** `BRIDGE_MOCK_SCRIPT=<json>` loads a scripted now-playing source used only by tests — an array of `{ "holdMs": number, "nowPlaying": NowPlaying }` steps, evaluated against cumulative elapsed time and looped (`e2e/fixtures/bridge-mock-script.json`). Unset, the bridge uses real OS detection with no behavior change.

## Runtime Smoke-Verification

Exercise the live provider chain with and without cache:

```bash
npm run smoke
```

Uses a track that is **not** in the curated database (e.g., *Yesterday — The Beatles*) to force real network requests through the chain, then measures cold fetch vs warm cache-hit latency.

Result of a live run (2026-10-13):

| Pass | `useCache` | Latency | Provider | Lines |
| :--- | :--- | ---: | :--- | ---: |
| Cold (forced network) | `false` | 1728 ms | LRCLIB | 20 |
| Warm (cache miss) | `true` | 814 ms | LRCLIB | 20 |
| Warm (cache hit) | `true` | 0 ms | LRCLIB | 20 |

The cache-hit pass avoids the network round-trip entirely (0 ms), confirming `fetchLyrics` returns cached `LyricsData` for repeat plays.

Exercise the native bridge while `npm run tauri:dev` (or the built app) is running:

```bash
npm run bridge:smoke
```

It reads the HTTP snapshot and the first WebSocket frame, checks the `NowPlaying` fields, and prints the detected session. Result of a live run (2026-10-12, Windows SMTC detected an active browser media session):

```
HTTP GET /now-playing:
  source        windows-smtc
  title         Expensive INVESTMENT in Foundation - MASSIVE New Update - Harvest Festival | Part 03
  artist        Nivarias
  isPlaying     false
  positionMs    2297912
  durationMs    2297912
RESULT: PASS - bridge reachable over HTTP + WebSocket (idle payload expected when nothing is playing)
```