# 08_SPEC_HARDENING.md — Phase 8: Hardening & Release

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Phase:** 8 of 8 (see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD`) — final phase / MVP close-out
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Close out the MVP: lock every quality gate, produce installable desktop builds, add continuous integration that validates the project on Windows plus macOS/Linux, finalize the documentation, deliver the final demo, and declare the MVP complete per the Global Definition of Done in `specs/PROJECT_OVERVIEW.MD` (§4).

## 2. Context

This is Phase 8 — the last phase of the 8-phase roadmap described in `specs/PROJECT_OVERVIEW.MD` (§5: "**Hardening & release**: typecheck/lint clean, multi-platform validation, docs, and final demo"). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (implemented through Phase 7):**

- ✅ Phases 1–7 shipped on the `dev` branch: scaffold, lyric engine, floating-window UX, playback sync, pluggable AI fallback, native companion bridge (Tauri v2 + Rust), and automated testing.
- ✅ Automated testing (Phase 7): 131 frontend tests (Vitest + jsdom + Testing Library), 36 Rust tests (`cargo test`), an 8-test Playwright E2E suite against the real bridge binary, and a combined coverage gate — **92.81% line coverage** (frontend 91.99%, Rust 93.92%) against the ≥ 85% hard gate (`npm run coverage:report`).
- ✅ Quality tooling in place: `npm run lint` (`tsc --noEmit`), `cargo fmt --check`, `cargo clippy --all-targets`, and the smoke scripts (`npm run smoke`, `npm run bridge:smoke`) — all green.
- ✅ Tauri packaging config exists (`src-tauri/tauri.conf.json`): `productName` "Amazon Music Floating Lyrics", version `0.1.0`, identifier `com.lyrics.amazonmusic`, `bundle.targets = "all"`, and the icon set (32/128/2x PNG, `.icns`, `.ico`) are already declared.
- ✅ Bridge: Rust-native localhost HTTP + WebSocket server on `127.0.0.1:48765` (`/health`, `/now-playing`, `/ws`) with Windows SMTC live-validated and macOS/Linux adapters behind the same `NowPlayingSource` trait (fixture-tested).
- ⬜ **No CI configuration exists** (`.github/` is absent); releases are produced manually; macOS/Linux are only ever compiled/tested through their portable, platform-neutral test fixtures.

**Promised to Phase 8 by earlier specs (consolidated):**

- **Packaging polish** and Windows installable builds (`specs/06_SPEC_DETECTION.md` §5).
- **Full cross-platform verification** — macOS MediaRemote / Linux MPRIS runtime validation deferred to Phase 8 (`06` §2/§5, `07_SPEC_TESTING.md` §5); achievable without local hardware via GitHub-hosted macOS/Ubuntu runners compiling and running the portable Rust + frontend suites.
- **CI automation** — a Windows GitHub Actions runner running the suites belongs to Phase 8 release hardening (`07 §5`).
- **Code signing / notarization and auto-update** were deferred to Phase 8 (`06 §5`) but require certificates/accounts; without them they move to the post-MVP backlog (see §5).
- **Packaged-app E2E** via `tauri-driver`/WebdriverIO deferred to Phase 8 by `07 §5`; parked in the post-MVP backlog by decision (see §5).

**Key decisions:**

- **CI:** add a GitHub Actions workflow with a **Windows job** running the full gate set (lint, build, Vitest, coverage gate, Rust fmt/clippy/test, Playwright E2E) and **macOS + Ubuntu matrix jobs** running frontend build/lint and `cargo test` — the only realistic multi-platform validation available (development is Windows-only; headless CI cannot exercise live SMTC/MediaRemote/MPRIS sessions, so those OS adapters remain fixture-covered by contract).
- **Release packaging:** `npm run tauri:build` produces the Windows installers (NSIS `.exe` + MSI). The packaged app must boot with the bridge healthy on `127.0.0.1:48765`; no code signing/notarization without certificates.
- **Packaged-app E2E (`tauri-driver`):** **post-MVP backlog** — the Playwright harness already covers the full frontend↔bridge contract without WebDriver.
- **MVP close-out:** the Global DoD in `PROJECT_OVERVIEW.MD` §4 and the README status line are updated once the final demo is delivered; `specs/PROMPTS.md` records this phase.

**Out of scope for this phase:** new product features; changes to detection, lyrics, AI, or UI behavior; code signing/notarization/auto-update (no certificates/accounts); `tauri-driver` packaged-app E2E; advanced testing (fuzz/property, visual regression, load/performance); the AI API-key security overhaul (OS keychain / server-side proxy / encrypted storage) deferred from `05_SPEC_AIFALLBACK.md` §5; bridge auto-discovery and transport control commands deferred from `06` §5.

## 3. Tasks and Responsibilities

### 3.1 Packaging & Release

| Task | Responsibility |
| :--- | :--- |
| Verify `npm run tauri:build` completes and produces the Windows installers (NSIS `.exe` + MSI) from the existing `bundle.targets = "all"` config. | Delivery |
| Confirm the installed/packaged app launches: the webview renders the UI and the embedded bridge is healthy (`GET /health` on `127.0.0.1:48765`; `GET /now-playing` returns a valid snapshot). | Delivery & Quality |
| Record installer output paths and minimum system requirements (Rust/MSVC toolchain for building, WebView2 runtime for running) in the README. | Documentation |

### 3.2 Continuous Integration

| Task | Responsibility |
| :--- | :--- |
| Add `.github/workflows/ci.yml` with a **Windows** job running the full gate set: `npm ci`, `npm run lint`, `npm run build`, `npm run test` + coverage, `npm run coverage:report` (≥ 85% gate), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, and the Playwright E2E suite. | Delivery |
| Add **macOS** (`macos-latest`) and **Ubuntu** (`ubuntu-latest`) matrix jobs: `npm ci`, `npm run lint`, `npm run build`, and `cargo test` (the platform-neutral parser/poller/router tests are portable) — covering the multi-platform validation ask without local hardware. | Delivery & Quality |
| Cache `node_modules` and the Cargo target dir between runs; keep the workflow free of secrets (public runners, no signing, no private env). | Quality / Code Safety |
| Keep CI green as the release gate; document the workflow lanes in the README. | Documentation |

### 3.3 Multi-Platform Validation

| Task | Responsibility |
| :--- | :--- |
| Validate frontend + Rust core compile and the portable suites pass on macOS and Linux via the CI matrix jobs (§3.2). | Delivery & Quality |
| Keep Windows SMTC as the live-validated path (local `bridge:smoke` + E2E); document that SMTC/MediaRemote/MPRIS live sessions cannot run on headless CI and remain fixture-covered until post-MVP hardware validation. | Documentation |

### 3.4 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Re-run the full local gate set and confirm every gate is green: `npm run lint`, `npm run build`, `npm run test` (131), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test` (36), `npm run coverage:report` (≥ 85%), `npm run test:e2e` (8), `npm run smoke`, `npm run bridge:smoke`. | Quality |
| Do not introduce product features, runtime dependencies, or Phase changes beyond hardening; no secrets; `.env*` remains ignored; CI uses only public runners and workflow-defined steps. | Code Safety (per `00_AI-SAFE.md`) |
| Do not implement post-MVP backlog items listed in §5. | Code Safety |

### 3.5 Documentation, Delivery & Final Demo

| Task | Responsibility |
| :--- | :--- |
| Update the README: a **Packaging & Release** section (prereqs, `npm run tauri:build`, installer output paths, running the installed app), a **CI** section (workflow lanes + matrix), and the status line → Phase 8 / MVP complete. | Documentation |
| Record this phase in `specs/PROMPTS.md` and check this spec's DoD; reflect MVP completion in `specs/PROJECT_OVERVIEW.MD` (§4 Global DoD) and keep `PROJECT_OVERVIEW.MD` consistent with the implemented state. | Documentation |
| Deliver the final demo: `npm run dev` (and the packaged app) walking through curated-track lyrics, karaoke + full-sheet modes, sync calibration, search, the AI fallback staying graceful without a key, and desktop-app detection via the bridge; record the result. | Delivery & Documentation |

## 4. Definition of Done

- [x] All quality gates pass locally: `npm run lint`, `npm run build`, `npm run test`, `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run coverage:report` (≥ 85% combined), `npm run test:e2e`, `npm run smoke`, and `npm run bridge:smoke`.
- [x] `npm run tauri:build` produces Windows installers (NSIS `.exe` + MSI).
- [x] The packaged app launches with the UI rendering and the bridge healthy on `127.0.0.1:48765`.
- [x] `.github/workflows/ci.yml` exists with a Windows full-gate job and macOS/Ubuntu lint/build/`cargo test` matrix jobs, all green.
- [x] README documents packaging/release, CI, and the final demo; the status line reflects the MVP completion.
- [x] `specs/PROMPTS.md` records Phase 8; this spec's DoD is checked; `specs/PROJECT_OVERVIEW.MD` §4 reflects MVP completion.
- [x] The final demo is delivered and its result recorded.
- [x] No post-MVP backlog features (signing/notarization/auto-update, `tauri-driver` E2E, advanced testing, AI key-security overhaul, bridge discovery/transport controls) were introduced during this phase.

## 5. Deferred / TODO (post-MVP backlog)

- **Code signing, notarization, and auto-update:** require certificates/accounts not available in this phase; installers remain unsigned.
- **Packaged-app E2E with `tauri-driver`:** driving the real Tauri window (WebdriverIO, `msedgedriver`) — parked here from Phase 7; the Playwright harness remains the E2E contract.
- **Advanced testing:** fuzz/property tests of the metadata parsers, visual regression of the floating window, and load/performance testing.
- **AI API-key security follow-up** (`05_SPEC_AIFALLBACK.md` §5): OS keychain, a server-side proxy keeping keys off the client, or encrypted at-rest storage for saved AI lyrics.
- **Bridge discovery & transport controls** (`06_SPEC_DETECTION.md` §5): auto-discovery of the bridge (vs. the fixed documented port) and playback-command controls back to the desktop app.
- **Live macOS/Linux adapter validation** on physical hardware with real MediaRemote/MPRIS sessions (CI runners are headless; adapters stay fixture-tested here).