# Lyrics for Amazon Music — Lyrics Companion

A standalone, desktop-style companion that shows the lyrics of whatever **Amazon Music** is currently playing. The app is **auto-detect only** and docks the lyrics into a single, coherent surface inside the main window — with the currently playing song and album art prominent at the top.

- **Lyrics providers:** an ordered synced-first chain — **LRCLIB (synchronized LRC) → Lyrica (time-synced) → Genius (plain text)** — with per-song thumbs up/down feedback. A genuine **"Lyrics not found"** state is shown only when the whole chain comes up empty.
- **AI karaoke sync:** when only plain lyrics exist, a **Generate Karaoke (AI)** action captures the audio via **WASAPI loopback**, aligns it with a user-configured Whisper-class endpoint, merges the timings, and **saves the result permanently** (labelled `AI Sync`) so future lookups replay instantly. The endpoint URL + model persist; the API key is session-only.
- **Playback sync:** synchronized karaoke highlighting driven by the detected playback position, with `±0.5s` / `±0.1s` calibration shown alongside the lyrics. The clock clamps only against a **real** track duration and free-runs past the 3-minute display fallback when the timeline is unknown.
- **Real album art & metadata truth:** the native bridge reads the Windows SMTC thumbnail (returned as a size-capped `data:` URL); placeholder/garbage metadata (e.g. a literal `"Artist name"`) is rejected in favour of the last good track, and a **Fix** control lets you correct a wrong title/artist and re-run the provider search (corrections persist per track and are revertible).
- **Dual display modes:** Synchronized Karaoke (synced results) and Full Lyrics Sheet (plain-only results), with a panel header and custom scrollbars that stay visible at compact window sizes.
- **Info panel:** **artist / song / album** details and trivia supplied by the lyrics provider, with a graceful empty state.
- **Most Listened:** a local, restart-durable usage view with **Hot (last 5 days) / Month / Lifetime** tabs; a play counts only after **≥ 30 seconds** of real playback **from Amazon Music** (non-Amazon sessions and legacy unflagged records are excluded).
- **One Options menu:** all customization — lyrics layout preset, backdrop, appearance (opacity/blur/font/palette), default sync offset, **Karaoke AI endpoint/model/key**, and a Most Listened reset — lives in a single menu.

> Status: Phase 8 (Hardening & Release) — **MVP complete**; post-MVP packaging (`specs/09_SPEC_POSTMVP-APP-PACK.md`), the lyrics/UX minor patch (`specs/10_SPEC_POSTMVP-MIN-PATCH.md`), the critical lyrics-pipeline fix (`specs/11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md`), the post-MVP UX redesign (`specs/12_SPEC_POSTMVP-UX-REDESIGN.md`), the live-core patch (detection/metadata/playback/lyrics, `specs/13_SPEC_POSTMVP-LIVE-CORE-PATCH.md`), the lyrics-panel UX / provider-chain / AI-karaoke patch (`specs/14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`), the release-hardening patch (single instance, test update channel, packaged-app E2E, `specs/15_SPEC_POSTMVP-RELEASE-HARDENING.md`), and the fuzzy-lookup / local-first / window-geometry patch (`specs/16_SPEC_POSTMVP-FUZZY-LOOKUP-RELEASE.md`) are implemented on `dev` at version **0.5.4**. See `specs/PROJECT_OVERVIEW.MD` for the roadmap and `specs/00_AI-SAFE.md` for the SpecDD scope rules.

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

   The AI **API key is never read from env** (that would expose it in the client bundle). The in-app **AI Options** menu was **hidden as part of the spec-12 redesign** — reactivating a usable AI fallback is deferred (see [AI Lyric Fallback](#ai-lyric-fallback) and `specs/12_SPEC_POSTMVP-UX-REDESIGN.md` §5).

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
| `npm run test` | Run the Vitest unit/component suites (359 tests). |
| `npm run test:coverage` | Run Vitest with the v8 coverage provider. |
| `npm run coverage:report` | Combined FE + Rust coverage aggregation (gates: ≥ 85% lines overall, **100%** on the critical utilities). |
| `npm run test:e2e` | Build UI + bridge, run the Playwright E2E suite (13 tests). |

## Project Structure

```
src/
  types/       Domain types (Song, LyricLine, LyricsData, AppSettings, WindowState, ...)
  services/    Lyric engine (provider chain retrieval, LRC parsing, egress, feedback/bridge
               clients, local settings + play-history stores)
  services/providers/  Ordered lyrics sources (Genius, LRCLIB)
  components/  UI (NowPlayingHeader, LyricsPanel, InfoPanel, MostListenedPanel,
               OptionsMenu, KaraokeLyricsView, FullSheetLyricsView, BackgroundBackdrop)
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

1. **User-accepted** — a result previously saved with thumbs up (`src/services/userLyricsStore.ts`, `localStorage`, normalized `title|artist` key).
2. **Saved AI** results (`provider: "AI Sync"`, `src/services/aiLyricsStore.ts`).
3. **Lyrics cache** — a result from an earlier lookup this install (`src/services/lyricsCache.ts`, `localStorage`, persisted across restarts).
4. **Provider chain** — **LRCLIB → Lyrica → Genius** (`src/services/providers/*`). Each provider self-times-out via `AbortController` and degrades to the next on error/block/miss, so playback is never blocked. Titles/artists are normalized before every query (release noise such as `(Remastered 2011)`, `- Radio Edit`, `feat. …` is stripped) and candidates must pass a fuzzy identity check against the requested track. LRCLIB provides synchronized LRC; Lyrica provides synced lyrics; Genius is the plain-text fallback. All provider network I/O goes through a single egress layer (`src/services/httpClient.ts`) that fetches **direct-first** and **falls back to the local bridge `/fetch` proxy** when the production webview's CORS policy blocks the upstream.
5. **Live AI fallback** (currently inert — the in-app AI Options were deferred; see [AI Lyric Fallback](#ai-lyric-fallback)).

- **Sync semantics:** the chain prefers the first **synchronized** result and keeps the first **plain-only** result as a fallback. Synchronized results drive **Karaoke**; plain-only results render in **Full Sheet** mode (the layout auto-switches view mode accordingly).
- **Not found:** when all providers (+ AI, when configured) return nothing, the lyrics surface shows **"Lyrics not found"**. The previous fabricated sample-lyrics fallback has been removed from the automatic path.
- **Thumbs up:** persists the winning result locally (survives restarts, per `title|artist`) and is preferred on later lookups. **Thumbs down:** advances to the next provider in the chain; once exhausted it falls through to AI/not-found.
- **Re-selection:** with the search bar removed, previously played songs are shown in the **Most Listened** view and can be re-selected there to re-display their lyrics.

## Lyrics Cache

Recently played song lyrics are cached **in `localStorage`** so repeat plays—and restarts—skip the provider chain.

- **Scope:** `fetchLyrics` results only (recently played song data).
- **Key:** normalized `title|artist` (same identity key as the saved stores).
- **Bounded:** max 20 entries (LRU-style eviction of oldest on overflow).
- **TTL:** entries expire after 7 days.
- **Durable:** written on every cache set (including thumbs-up / AI save write-through), hydrated on startup, expired entries dropped.
- **Bypass:** `fetchLyrics(song, { useCache: false })` skips both cache lookup and write; `fetchLyrics(song, { startFromIndex })` starts mid-chain (used by thumbs down).
- Created in `src/services/lyricsCache.ts`; exports `getCachedLyrics`, `setCachedLyrics`, `clearLyricsCache`, `getCacheStats`.

## Most Listened

A local, restart-durable usage view reached from the **Most Listened** toggle in the header.

- **Store:** `src/services/playHistoryStore.ts` persists per-song play counts and timestamps in `localStorage` (key `lyrics-amazon:play-history:v1`).
- **Scoring rule:** a play is recorded **only after ≥ 30 seconds** of real, native (desktop) playback in a single track-session; seek jumps and pauses/rewinds never inflate the count. Playback from the in-browser Media Session path is not scored.
- **Tabs:** **Hot** (last 5 days), **Month** (current month ranking), and **Lifetime** (all-time counts).
- **Re-selection:** clicking a row re-displays that song's lyrics (replaces the removed search bar).
- **Reset:** the **Options** menu and the panel both offer a **Reset Most Listened** action.

## Local Data & Storage

The app has **no account and no cloud sync**: everything it saves stays on your machine (the only network traffic is the provider-chain lyric requests through the bridge `/fetch` egress proxy, plus the update check). Persistence is deliberately small — the app itself writes `localStorage` JSON (seven versioned keys) plus one native window-state file; debug builds additionally append a log file (below).

| Key (`localStorage`) | Module | Contents | How to reset |
| :--- | :--- | :--- | :--- |
| `lyrics-amazon:settings:v1` | `src/services/settingsStore.ts` | **Options**: opacity/blur, theme, font size, Karaoke/Full Sheet view, auto-scroll, backdrop, layout preset, sync offset | edited in place by the Options menu |
| `lyrics-amazon:play-history:v1` | `src/services/playHistoryStore.ts` | **Most Listened**: per-song play timestamps (≥ 30 s, Amazon Music only) with title/artist/album and the album-art thumbnail (`data:` URL) | **Reset Most Listened** (Options menu or the panel) |
| `lyrics-amazon:user-accepted-lyrics:v1` | `src/services/userLyricsStore.ts` | **Thumbs-up lyrics** — yes, they are saved: the full winning `LyricsData` (synced lines, plain text, annotations, provider) per normalized `title\|artist`, preferred first on every later lookup | none in the UI (the store can clear per song) |
| `lyrics-amazon:lyrics-cache:v1` | `src/services/lyricsCache.ts` | **Recently played lyrics cache** — latest lookup result per normalized `title\|artist` (max 20, 7-day TTL), persisted so restarts skip the provider chain | expires automatically; cleared by wiping the profile |
| `lyrics-amazon:meta-overrides:v1` | `src/services/metaOverrideStore.ts` | **Fix** corrections (title/artist) per detected track, applied to future detections of that track | **Revert** on the Fix control |
| `lyrics-amazon:ai-lyrics:v1` | `src/services/aiLyricsStore.ts` | Permanently saved `AI Sync` lyrics (plain text aligned by the AI karaoke pipeline) | none — pipeline currently dormant |
| `lyrics-amazon:karaoke-ai:v1` | `src/services/karaokeAIConfigStore.ts` | Karaoke AI **endpoint + model only** — the API key is session-memory and is never written to disk | edited in Options |

**Kept in memory only (lost on restart):**

- **AI / karaoke API key** — session-only by design (never on disk, never in the bundle).
- **Diagnostics** — release builds write **no log file at all**; `npm run tauri:dev` (debug builds) append to the log path below, and provider diagnostics print to the dev console only (`src/services/devLog.ts`).

**Remembered by the window manager:** position and size are restored on launch (native `tauri-plugin-window-state`, size + position only). If the saved geometry no longer intersects an attached monitor (e.g. a display was unplugged), the window re-centers on the primary monitor instead of opening off-screen.

**Where it lives on disk (Windows):**

| Path | What |
| :--- | :--- |
| `%LOCALAPPDATA%\com.lyrics.amazonmusic\EBWebView\Default\Local Storage\leveldb\` | The webview profile's `localStorage` — all seven keys above, as JSON inside a Chromium leveldb. The packaged app's origin is `http://tauri.localhost`; `npm run tauri:dev` stores its `http://localhost:3000` entries in the same folder, while a plain `npm run dev` in a normal browser uses that browser's own profile instead. |
| `%APPDATA%\com.lyrics.amazonmusic\.window-state.json` | Native window geometry (size + position) written by the Rust **window-state** plugin. |
| `%LOCALAPPDATA%\com.lyrics.amazonmusic\logs\Amazon Music Floating Lyrics.log` | Debug-build log only (created by `tauri:dev`/debug runs; release installs never write it). |
| `%LOCALAPPDATA%\Amazon Music Floating Lyrics\` | The installed program itself (two `.exe` files) — the app writes no data here. |

The remaining `EBWebView\` content (HTTP cache, cookies, GPU/shader caches) is standard WebView2 profile data maintained by Windows.

**To wipe everything:** close the app and delete `%LOCALAPPDATA%\com.lyrics.amazonmusic` **and** `%APPDATA%\com.lyrics.amazonmusic` — settings, history, saved lyrics, the cache and the remembered window geometry are rebuilt on the next launch (lyrics are simply re-fetched). Uninstalling does **not** remove these folders (the NSIS uninstaller deletes only the program directory), so the same folders are the full-reset step after uninstalling, too.

## AI Lyric Fallback

> **Deferred (spec 12):** the inert **AI Options menu was removed** from the UI in the UX redesign — the AI service code is unchanged, but the app no longer collects an API key, so the AI fallback is **inert** until a usable AI experience is scoped in a later spec (`specs/12_SPEC_POSTMVP-UX-REDESIGN.md` §5). The mechanics below describe the retained (dormant) code path.

When a track has no coverage from any provider in the chain, the app can synthesize synchronized lyrics and annotations through a **provider-agnostic** adapter over any **OpenAI-compatible** `chat/completions` endpoint.

- **Configuration:** endpoint and model resolve from session settings first, then `VITE_AI_PROVIDER_URL` / `VITE_AI_MODEL`. A Google Gemini model is an option, not a requirement.
- **API key:** was entered in the (now-deferred) **AI Options** menu and held **in memory for the session only** — it is never written to disk, env, or the client bundle. With the menu hidden the key is empty, so `resolveAIConfig` disables the fallback.
- **Requests:** issued directly from the browser via `fetch` to `${providerUrl}/chat/completions`. Some providers may reject cross-origin requests (CORS) — if so, run the app behind a proxy for that provider.
- **Persistence:** AI-generated results (`provider: "AI Sync"`) are saved **permanently in `localStorage`** (keyed by `title|artist`, no expiry) and reused on repeat plays.
- **Fallback:** if the provider is unconfigured, unreachable, times out, or returns malformed data, the app degrades to the genuine **"Lyrics not found"** state without blocking playback (fabricated lyrics are no longer produced).

> Security note: keeping a built-in key out of the client would require a server-side proxy (the key never reaches the browser). This is intentionally deferred — see `specs/05_SPEC_AIFALLBACK.md` §5.

## Native Companion Bridge (Desktop Detection)

The Amazon Music **desktop app** is detected by a Rust-native bridge hosted in the Tauri core (single binary, no Node runtime shipped). It reads OS-level now-playing metadata and publishes it on localhost:

- **Windows (this phase):** SMTC via `windows-rs` `GlobalSystemMediaTransportControlsSessionManager`, polled once per second (MTA COM, session title/artist/album, timeline position/duration, playback status). When several media apps are running, the bridge **prefers a playing Amazon Music session**, and otherwise falls back to the system's current session (behavior-neutral when only one session exists). The macOS/Linux adapters mirror the same preference structurally.
- **macOS / Linux (best-effort, code-complete):** `nowplaying-cli` (MediaRemote) and `playerctl` (MPRIS) adapters behind a common `NowPlayingSource` interface; they compile and pass their fixture suites on macOS/Ubuntu in CI, but live-session validation on real hardware is a post-MVP item.
- **Transport:** `GET /now-playing` (current snapshot), `GET /health`, and `GET /ws` — a WebSocket that pushes every change. All on `127.0.0.1:48765`, localhost only.
- **Payload:** `NowPlaying { source, title, artist, album, durationMs, positionMs, isPlaying }` (`camelCase` JSON).
- **UI behavior:** when the bridge is connected, the detected track is mapped into the existing `Song`/playback state and lyrics load through the normal `fetchLyrics` cascade; position/play state are kept in sync. When the bridge is offline, the client keeps reconnecting with backoff and the browser Media Session path continues to work unchanged.
- **Indicator:** the now-playing header shows **Desktop (native)** when the bridge is connected, or **Browser (Media Session)** otherwise.

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
- **Release-candidate builds** are produced with `npm run tauri:build -- --config src-tauri/tauri.rc.conf.json` (CI passes the same `--config` for tags containing `-`): the override repoints the updater at the rolling **`test-latest`** test channel and bundles the **NSIS installer only** — the updater's artifact of record — because WiX/MSI rejects non-numeric pre-release versions like `0.5.3-rc.1` (stable builds keep both targets; `tauri.conf.json` stays untouched). The pipeline builds the release as a **draft**, runs the packaged-app E2E gate (`npm run test:e2e:packaged`, requires `tauri-driver` + `msedgedriver`), and only publishes (then refreshes `test-latest`) when the gate passes.

### Branching & Staging

- **`dev`** — integration branch; every change lands here first and is validated by CI. Currently carries version **0.5.4**.
- **`staging`** — long-lived release-candidate branch where the in-progress version is staged (cut from `dev`, advanced by merging `dev` → `staging`). CI runs on its pushes too.
- **`vX.Y.Z` tags** — cut from `staging` for a stable release; the tag workflow publishes a normal GitHub Release and the in-app updater offers it.
- **`vX.Y.Z-rc.N` tags** — testing pre-releases. Any tag containing `-` publishes as a GitHub **pre-release** (e.g. `v0.5.3-rc.1`) and stays excluded from `releases/latest`; **rc builds instead auto-update through the rolling `test-latest` channel** (see below), so testers on the rc line receive each new rc automatically while stable installs are never offered one.

### Install for Testing

- **Download:** the Windows NSIS installer (from the [Releases page](https://github.com/Gilgamashed/lyrics-amazon/releases) — either a **stable** release or a `-rc.N` **pre-release**; the NSIS `.exe` is the updatable artifact of record, the `.msi` is a secondary manual install).
- **Install:** run the installer, then launch **Amazon Music Floating Lyrics**.
- **SmartScreen (unsigned build):** Windows may show *"Windows protected your PC"* — click **More info** → **Run anyway**.
- **Auto-update (stable):** on launch the app checks `releases/latest`; when a newer **signed** stable build exists it prompts you to **Update**, downloads and installs it, then relaunches. When offline or the endpoint is unreachable it stays quiet and the app keeps working. (Verified: an installed `0.2.0` updated in-app to `0.2.1`.)
- **Auto-update (testing channel):** builds installed from a `-rc.N` pre-release read the rolling **`test-latest`** asset instead (`…/releases/download/test-latest/latest.json`), which CI refreshes to the newest published version after every gated publish. Each new `vX.Y.Z-rc.N` therefore prompts in-app on the next launch; stable installs are unaffected. (Verified live 2026-10-19: an installed `v0.5.3-rc.1` prompted and updated in-app to `v0.5.3-rc.2` — prompt → download → passive install → relaunch.)
- **Reverting to stable:** install the current stable NSIS artifact from the Releases page over the rc build; the stable build reads `releases/latest` again and no rc will be offered.
- **Minimum requirements:** Windows 10/11 (x64) with the WebView2 runtime (preinstalled on current Windows).

## CI (GitHub Actions)

A workflow (`.github/workflows/ci.yml`) runs on every push to `dev` and `staging` and on pull requests:

- **`quality-gates`** (Windows runner): `tsc --noEmit` lint, production build, the Vitest suite (359 tests), the combined ≥ 85% coverage gate, `cargo fmt --check`, `cargo clippy --all-targets`, 54 Rust tests, and the 13-test Playwright E2E suite (system Chrome is preinstalled on the runner — no bundled Chromium download).
- **`platform-matrix`** (macOS + Ubuntu runners): `npm ci`, lint, build, and `cargo test` — the multi-platform validation cover (Ubuntu installs the Tauri system dependencies first).
- The workflow is intentionally **secrets-free** (public runners, no signing) and caches the npm and Cargo build caches between runs.

A second workflow (`.github/workflows/release.yml`) runs when a `v*` tag is pushed (e.g. `v0.5.3-rc.1` or a stable `v0.2.1`) on a **`windows-2022`** runner — pinned deliberately: on `windows-2025`/`windows-latest` the WebView2 Runtime (≥150) drops the `--remote-debugging-port` argument that msedgedriver injects on **elevated** hosts (GitHub runners run as administrator), so WebDriver session creation always fails with `DevToolsActivePort file doesn't exist` (upstream: [tauri-apps/wry#1782](https://github.com/tauri-apps/wry/issues/1782), [actions/runner-images#14738](https://github.com/actions/runner-images/issues/14738); revisit when fixed): it installs Node/Rust, runs lint + the Vitest suite, then builds via `tauri-apps/tauri-action` into a **draft** GitHub Release — with `--config src-tauri/tauri.rc.conf.json` for tags containing `-` so rc builds point at `test-latest`. After the build it runs the **packaged-app E2E gate** (`npm run test:e2e:packaged`: `tauri-driver` + `msedgedriver` drive the freshly built binary through 5 checks — version annotation, `/health`, badge + mock track, second-launch single-instance exit, quiet startup update check); **only if the gate passes** does it flip the draft to published and refresh the rolling **`test-latest`** `latest.json` (created on first rc, `-clobber` uploaded thereafter) — a failing gate leaves the release unpublished. Tags containing `-` are marked GitHub **pre-releases** and excluded from `releases/latest`, so they are never auto-update candidates for stable installs. It is the only workflow that uses secrets (the updater signing key) and is scoped to `contents: write`.

## Testing

Implemented in Phase 7 (`specs/07_SPEC_TESTING.md`), with the packaged-app gate added by `specs/15_SPEC_POSTMVP-RELEASE-HARDENING.md`. Four layers:

- **Frontend (Vitest + jsdom + Testing Library):** `npm run test` runs 359 tests across provider-chain, service, component/state, and `App` suites. Covers LRC parsing, the lyric/AI/cache/bridge services, the ordered provider chain + per-provider extraction, the not-found state, thumbs feedback persistence, the playback state machine, the settings/play-history stores (incl. the ≥30s scoring rule), the redesigned panels (now-playing header, lyrics panel, Info panel, Most Listened, Options), network resiliency (timeouts, non-OK, malformed payloads), and UI contracts.
- **Rust core (`cargo test`):** 54 tests in `src-tauri/src` — `NowPlaying` serde, metadata parsers (macOS `nowplaying-cli` / Linux `playerctl` fixtures run on Windows), the Amazon Music session-preference helpers, sanitizers, the poller, the single-instance/bridge bind-failure seam (`run_with`), the off-screen window geometry guard, and axum `/health`, `/now-playing`, `/ws`, `/fetch` integration incl. localhost-only CORS.
- **E2E (Playwright):** `npm run test:e2e` builds the UI and the real bridge binary, spawns the bridge with a test-only mock now-playing source, and drives **system Chrome** (`channel: 'chrome'`; the bundled Chromium download is unreliable in this environment) through the connected and degraded paths — boot and detect the scripted Espresso track from the bridge, switch to the Most Listened view, track change via the bridge, unknown-track mapping in the header, real album art + app id, small-viewport chrome, the HTTP/WebSocket contract, the `/fetch` CORS-egress proxy, and fall-back to Browser (Media Session) when the bridge is killed. With single-instance active (spec 15), the harness fails fast: `global-setup` and the egress tests detect an early bridge exit instead of hanging.
- **Packaged-app E2E (release gate):** `npm run test:e2e:packaged` (needs `cargo install tauri-driver` and a built `src-tauri/target/release/*-bridge.exe`; `msedgedriver` is auto-downloaded to `test-results/msedgedriver/`) launches the **release binary** through `tauri-driver` + WebView2 WebDriver and asserts 5 checks: `v<package.json>` version annotation, `/health` on 48765, the **Desktop (native)** badge + mock track title, second-launch single-instance exit (first instance stays healthy), and a quiet startup update check. It runs locally before every tag cut and in `release.yml` **between build and publish** (on the pinned `windows-2022` runner — see the CI section).

**Coverage policy:** combined line coverage across frontend and Rust must be ≥ **85%** (hard gate), and the **critical utilities must be at 100%** (the critical set is defined and enforced in `scripts/coverage-report.ts`). Aggregation runs fresh Vitest coverage plus `cargo llvm-cov --json` in `scripts/coverage-report.ts`; it exits non-zero on either gate. Exclusions (spec-approved, enforced): `src/main.tsx`, `*.test.ts(x)`, `src/test/**`, `src-tauri/src/main.rs`, `src-tauri/build.rs`, `src-tauri/gen/**`. Latest result: **92.51%** combined (FE 96.84%, Rust 85.22%), all 19 critical files 100%.

**E2E bridge mock:** `BRIDGE_MOCK_SCRIPT=<json>` loads a scripted now-playing source used only by tests — an array of `{ "holdMs": number, "nowPlaying": NowPlaying }` steps, evaluated against cumulative elapsed time and looped (`e2e/fixtures/bridge-mock-script.json`). Unset, the bridge uses real OS detection with no behavior change.

## Runtime Smoke-Verification

Exercise the live provider chain with and without cache:

```bash
npm run smoke
```

Uses a track that is not resolvable from any local cache (e.g., *Yesterday — The Beatles*) to force real network requests through the chain, then measures cold fetch vs warm cache-hit latency. It also runs a **live Genius parser check** (search + page extraction) and fails when no real lyrics come back.

Result of a live run (2026-10-15):

| Pass | `useCache` | Latency | Provider | Lines |
| :--- | :--- | ---: | :--- | ---: |
| Cold (forced network) | `false` | 4686 ms | Genius | 32 |
| Warm (cache miss) | `true` | 1547 ms | LRCLIB | 20 |
| Warm (cache hit) | `true` | 0 ms | LRCLIB | 20 |

Live Genius parser check (Yesterday — The Beatles): **PASS** — `provider: Genius`, 32 lines.

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