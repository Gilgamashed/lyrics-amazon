# 07_SPEC_TESTING.md — Phase 7: Automated Testing & Verification

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Phase:** 7 of 8 (see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD`)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Establish an automated test suite that verifies the metadata parsers, the playback/timing state machine, bridge event handling, and API resiliency on **both** sides of the app — the Rust core (native companion bridge) and the React/TypeScript frontend — plus a real end-to-end suite where the frontend and backend talk to each other, targeting **≥ 85% combined line coverage** and documenting all findings.

## 2. Context

This is Phase 7 of the 8-phase roadmap described in `specs/PROJECT_OVERVIEW.MD` (§5). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Roadmap change (accepted):** the former Phase 7 (Hardening & Release) is renumbered to **Phase 8**; Automated Testing becomes Phase 7. `specs/PROJECT_OVERVIEW.MD` and `specs/00_AI-SAFE.md` are updated accordingly.

**Current status (not yet implemented):** there is **no automated test tooling** in the repository:

- No Vitest/Playwright/Jest/testing-library configuration or dependencies exist; `npm run lint` (`tsc --noEmit`) and the ad-hoc smoke scripts (`scripts/smoke-lyrics.ts`, `scripts/smoke-bridge.ts`) are the only verification.
- The Rust core (`src-tauri/src/`) contains **zero** `#[test]` modules or integration tests.
- Platforms currently unimplemented anywhere: coverage reporting, combined coverage aggregation, browser-driven E2E.

**Testable surface (what this phase must pin down):**

| Layer | Targets |
| :--- | :--- |
| Frontend services | `parseLrc` (LRC variants, sorting, section detection), `searchTracks` (curated + remote merge/dedupe + failure fallback), `fetchLyrics` cascade (curated → LRCLIB → AI store → AI call → canned), `lyricsCache` (TTL, LRU eviction, bypass), `aiService` (`resolveAIConfig` precedence, `extractJson`, `toLyricLines`, annotations, `synthesizeLyrics`), `aiLyricsStore` (provider gating, corrupt storage), `bridgeService` (URL/env resolution, `http`→`ws` derivation, HTTP snapshot, WS reconnect/backoff). |
| Frontend state & UI | `App` playback/timing state machine (rAF timer, offset, track-change dedupe, bridge event handling), `AmazonMusicBar` (Desktop vs Browser indicator, Auto-Detect, search), `OptionsMenu` (masked session key), `KaraokeLyricsView` (active-line timing), `FullSheetLyricsView`. |
| Rust core | `NowPlaying` serde schema, `NowPlayingSource` trait + poller (diff detection, broadcast), axum routes (`/health`, `/now-playing`, `/ws`), localhost binding, macOS (`nowplaying-cli` JSON) and Linux (`playerctl`) metadata parsers, time/format sanitizers. |
| Integration | Browser↔bridge HTTP + WebSocket contract, graceful degradation when the bridge dies, network resiliency (timeouts, non-OK, malformed payloads) on both provider calls and bridge calls. |

**Key decisions:**

- **Frameworks:** Vitest + jsdom + Testing Library for the frontend; Rust's native test framework (`cargo test`) for the core; Playwright (headless Chromium) for E2E.
- **HTTP mocking:** no `msw`; provider/bridge calls are mocked with `vi.fn` fetch stubs + JSON fixtures (minimal dependencies). Playwright route interception covers the in-browser network cases.
- **Rust mocking:** the poller accepts an injected `NowPlayingSource`; unit tests use a scripted `MockNowPlayingSource` that simulates an Amazon Music session (idle → playing with advancing position → paused → track change), so no real SMTC session is required.
- **E2E strategy:** spawn the **real compiled bridge binary** with a test-only mock script, serve the real UI, and drive a headless browser through Playwright. This exercises the actual frontend↔backend contract without the weight/flakiness of a WebDriver-driven packaged app (tauri-driver is deferred to Phase 8).
- **Coverage gate:** **combined** line coverage ≥ 85% across the frontend and Rust core (per-side visibility reported), with a small aggregation script; exclusions: `src/main.tsx`, `src-tauri/src/main.rs`, `src-tauri/build.rs`, and generated code (`src-tauri/gen/`).
- **Test seams (declared, behavior-neutral when unset):**
  - Extract `parse_nowplaying_cli_json()` / `parse_playerctl_metadata()` from the macOS/Linux adapters into a platform-neutral parsing module so their fixtures run on all hosts.
  - Split `build_router(state)` / `serve(listener, router)` out of `bridge::run()` so integration tests can bind ephemeral ports.
  - Add `spawn_poller_with(source, state)` to inject a mock source.
  - Add an env-gated mock source: `BRIDGE_MOCK_SCRIPT=<path>` loads a JSON script (`[{ "holdMs": number, "nowPlaying": NowPlaying }, ...]`, looped) used only by tests; unset ⇒ real OS detection, no behavior change.

**Out of scope for this phase:** new product features; changes to detection, lyrics, AI, or UI behavior beyond the declared test seams and correctness fixes surfaced by failing tests (e.g., missing CORS headers on the bridge HTTP endpoint); CI pipeline setup, code signing/packaging, and macOS/Linux runtime validation (Phase 8); fuzzing, visual-regression, and performance/load testing.

## 3. Tasks and Responsibilities

### 3.1 Backend Testing (Rust core)

| Task | Responsibility |
| :--- | :--- |
| Unit-test `NowPlaying` (camelCase serde, nullable fields, `idle`), time-span/format conversions, and track-string sanitizers (trim, empty-field dropping, negative/clamped durations). | Delivery & Quality |
| Unit-test the extracted `nowplaying-cli` JSON and `playerctl` metadata parsers against fixtures (valid, missing fields, malformed, non-UTF8/garbage), runnable on Windows. | Delivery & Quality |
| Integration-test the axum router (via `tower::ServiceExt::oneshot` and a real ephemeral-port server): `/health`, `/now-playing` (idle + populated), `/ws` (snapshot-on-connect, push-on-change, no duplicate frames when unchanged), content types/status codes. | Delivery & Quality |
| Integration-test the poller with `MockNowPlayingSource` scripts (Amazon-Music-like sessions): diff detection, broadcast fan-out, lagged/disconnected client handling. | Delivery |
| Test the bind policy (localhost only) and failure paths (port already in use, malformed WS client). | Quality |
| Add dev-only dependencies for tests (`tower` with `util`, `http-body-util`, `tokio-tungstenite`); keep runtime dependencies unchanged. | Code Safety |

### 3.2 Frontend Testing (Vitest)

| Task | Responsibility |
| :--- | :--- |
| Set up Vitest + jsdom + Testing Library with a shared setup file, colocated `*.test.ts(x)` suites, and `npm run test` / `npm run test:coverage` scripts. | Delivery |
| Unit-test the lyric parsers and services: `parseLrc` edge cases, `searchTracks` merge/dedupe/failure fallback, `fetchLyrics` cascade order and cache bypass, `lyricsCache` TTL + LRU, `aiService` (config precedence, JSON extraction, sanitization/sorting, annotations), `aiLyricsStore` (provider gating, corrupt storage). | Delivery & Quality |
| Unit-test `bridgeService`: URL resolution (`VITE_BRIDGE_URL` default/override), `http`→`ws` derivation, `fetchNowPlaying` success/error/timeout, WS lifecycle (connect → message → close → backoff reconnect) with fake timers, `stop()` cancellation. | Delivery & Quality |
| Component-test the UI contract: Desktop vs Browser detection indicator, Auto-Detect toggle, search flow, Options menu (masked session key), Karaoke active-line timing (with offset), Full-sheet rendering. | Delivery |
| State-machine tests for `App` with a mocked bridge module and fake timers: track-change dedupe (no duplicate lyric loads), position/play/pause sync, offset behavior, and graceful degradation when the bridge disconnects (browser Media Session path unaffected). | Delivery & Quality |
| API-resiliency tests: LRCLIB/AI timeouts (AbortController fires), non-OK and malformed responses, and provider failures all fall through the cascade without throwing. | Quality |

### 3.3 End-to-End Testing (real bridge + headless browser)

| Task | Responsibility |
| :--- | :--- |
| Add a Playwright harness (`npm run test:e2e`): build/start the real bridge with `BRIDGE_MOCK_SCRIPT`, serve the UI, and drive headless Chromium. | Delivery |
| Assert the connected path end to end: Desktop (native) badge, detected title/artist in the top bar, lyrics auto-load (curated track for determinism + one route-intercepted network case), playback position advancing, pause, and track change triggering a second lyric load. | Delivery & Quality |
| Assert graceful degradation: killing the bridge flips the indicator to Browser and the app keeps working. | Quality |
| Assert the browser can read the HTTP snapshot and the WebSocket stream (this is expected to surface the missing CORS headers on the bridge HTTP endpoint from a non-Node origin; adding localhost-only CORS headers is in scope as a correctness fix if the test fails). | Quality |
| Keep E2E deterministic (no real SMTC dependency, no live provider calls, fixed ports or ephemeral assignment) and capture traces on failure. | Quality |

### 3.4 Documentation & Delivery

| Task | Responsibility |
| :--- | :--- |
| Add a coverage aggregation script (`npm run coverage:report`) combining Vitest (v8 provider, JSON summary) and `cargo-llvm-cov` line coverage into the combined ≥ 85% gate, with per-side reporting. | Delivery |
| Document testing setup, commands, coverage policy, and E2E harness in the README. | Documentation |
| Record findings in §6 of this spec: coverage table (per side + combined), bugs uncovered (e.g., CORS), known gaps (SMTC cannot be mocked; macOS/Linux parsers are fixture-tested only). | Documentation |
| Update `specs/PROJECT_OVERVIEW.MD` (roadmap: Testing = Phase 7, Hardening & Release = Phase 8) and `specs/PROMPTS.md`; keep this spec consistent with the implemented state. | Documentation |

### 3.5 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| No product behavior changes beyond the declared test seams and test-surfaced correctness fixes; with `BRIDGE_MOCK_SCRIPT` unset the bridge behaves exactly as in Phase 6. | Code Safety (per `00_AI-SAFE.md`) |
| Keep production dependencies untouched; only dev/test dependencies are added (Vitest, coverage provider, jsdom, Testing Library, Playwright; Rust dev-deps). | Quality |
| `npm run lint`, `cargo fmt --check`, and `cargo clippy --all-targets` (including test code) must pass. | Quality |
| Do not implement Phase 8 features (release hardening, packaging, CI pipelines, multi-platform validation); no secrets in fixtures; `.env*` stays ignored. | Code Safety |

## 4. Definition of Done

- [x] Vitest + jsdom + Testing Library are configured; `npm run test` runs the unit/component suites.
- [x] Frontend service unit tests pass (`lyricsService`, `lyricsCache`, `aiService`, `aiLyricsStore`, `bridgeService`).
- [x] Frontend component/state tests pass (`AmazonMusicBar` indicator, `OptionsMenu`, lyric views, `App` timing + bridge events).
- [x] Frontend network-resiliency tests pass (provider timeouts, errors, and malformed payloads fall through the cascade gracefully).
- [x] Rust unit tests pass: `NowPlaying` schema, sanitizers/formatters, and macOS/Linux metadata parsers (fixtures, runnable on Windows).
- [x] Rust integration tests pass: `/health`, `/now-playing`, `/ws` snapshot + push via `MockNowPlayingSource`, localhost-only binding, port-in-use and client-disconnect paths.
- [x] E2E suite passes: real bridge binary + mock script + headless browser assert badge, detected track, lyrics load, playback sync, track change, and graceful degradation after the bridge is killed.
- [x] Browser-origin HTTP/WS access to the bridge is verified; any missing CORS headers found are fixed (localhost-only) and covered by tests.
- [x] Combined line coverage is ≥ 85% (Vitest v8 + `cargo-llvm-cov`), with documented aggregation, per-side reporting, and exclusions.
- [x] `npm run lint`, `cargo fmt --check`, `cargo clippy --all-targets`, and `cargo test` pass with test code included.
- [x] The existing smoke scripts (`npm run smoke`, `npm run bridge:smoke`) still pass.
- [x] README documents all testing commands, the coverage policy, and the E2E harness.
- [x] Findings are recorded in §6 (coverage table, uncovered bugs, and known limitations).
- [x] `specs/PROJECT_OVERVIEW.MD` reflects the 8-phase roadmap (Testing = Phase 7; Hardening & Release = Phase 8); `specs/PROMPTS.md` records this phase.
- [x] No Phase 8 features were introduced during this phase.

## 5. Deferred / TODO

- **Packaged-app E2E:** driving the real Tauri window (tauri-driver/WebdriverIO, `msedgedriver`) is deferred to Phase 8; the Playwright harness covers the full frontend↔bridge contract without it.
- **CI automation:** running the suites in CI (e.g., a Windows GitHub Actions runner) belongs to Phase 8 release hardening.
- **Advanced testing:** property/fuzz testing of the parsers, visual regression of the floating window, and load/performance testing are not part of this phase.
- **Cross-platform runtime validation:** macOS MediaRemote and Linux MPRIS adapters remain fixture/unit-tested only; live validation is deferred to Phase 8.

## 6. Findings (recorded during execution)

> Executed on Windows 11 (Node 26, Rust stable/MSVC). All suites are uncommitted on `dev` and pass locally.

| Suite | Instrumented lines | Covered | Coverage |
| :--- | ---: | ---: | ---: |
| Frontend (Vitest v8) | 1274 | 1172 | 91.99 % |
| Rust core (`cargo-llvm-cov`) | 937 | 880 | 93.92 % |
| **Combined (gate: ≥ 85%)** | **2211** | **2052** | **92.81 %** |

### Exclusions (only the spec-approved set, enforced by `scripts/coverage-report.ts`)
`src/main.tsx`, all `*.test.ts(x)`, `src/test/**` (harness/fixtures), `src-tauri/src/main.rs`, `src-tauri/build.rs`, `src-tauri/gen/**`.
Note: `src-tauri/src/lib.rs` (the Tauri GUI entry that spawns the bridge) remains in the combined count at 0 % — it is only exercised by a full Tauri runtime and is covered by design through the E2E binary run, not by instrumented unit tests.

### Results by layer
- **Frontend services via Vitest (63 tests):** lyrics parsing, curated/remote merge + dedupe, fetch cascade + cache bypass, TTL/LRU, AI config precedence + JSON extraction + annotations, AI-lyrics store gating/corrupt storage, bridge URL resolution, HTTP snapshot, WS reconnect/backoff with fake timers. Per-file service line coverage: `lyricsService` 100 %, `lyricsCache` 100 %, `bridgeService` 100 %, `aiService` 98.33 %, `aiLyricsStore` 96 %.
- **Frontend components + App (68 tests, all suites 131 total):** detection indicator, auto-detect, search + empty state, OptionsMenu draft/key masking + clear, Karaoke active-line timing (incl. sync offset), Full-sheet search/highlight/copy, Genius panel, floating window drag/resize/clamp, backdrops, and the App state machine (rAF tick, track-change dedupe, media session metadata + actions, bridge handler rebound to latest AI config, AI save path with cache bypass, graceful degradation).
- **Rust core (36 tests):** `NowPlaying` serde + idle, `parse_nowplaying_cli_json()` / `parse_playerctl_metadata()` fixtures on Windows, sanitizers/time-span formatting, poller diff/broadcast via injected sources and `BRIDGE_MOCK_SCRIPT`, axum `/health`, `/now-playing`, `/ws` (snapshot-on-connect, push-on-change, no duplicate frames when unchanged, malformed frames tolerated), localhost-only CORS + binding, port-in-use, lagged clients.
- **E2E (Playwright, 8 tests):** real `cargo build` of the bridge + `BRIDGE_MOCK_SCRIPT` fixture + `vite preview` of the built UI + system Chrome: boot into curated Espresso (karaoke lyrics), Desktop (native) badge, mocked track-change to Cruel Summer re-syncs the bar + lyrics, unknown track maps to "Unknown Artist", HTTP `/health` + `/now-playing`, WebSocket stream observes ≥ 2 distinct snapshots, and killing the bridge flips the UI back to "Browser (Media Session)" without crashing.

### Bugs / correctness fixes surfaced by the tests
- **CORS on the bridge HTTP endpoint** (expected per §3.3): browsers denied the `fetch("/now-playing")` upgrade from a non-Node origin. Fixed with a localhost-only CORS layer (`bridge/mod.rs`: `cors_layer` reflects `Origin` only when `is_local_origin` — `localhost`, `*.localhost`, `127.0.0.1` on any port, plus `tauri://localhost` for the webview; OPTIONS preflight returns 204 with the allowed methods). Covered by `cors_reflects_allowed_localhost_origins`, `cors_is_not_added_for_foreign_or_missing_origins`, and `cors_answers_options_preflight_for_localhost`; exercised end-to-end by the browser-origin E2E tests.
- **WS frames duplicated on unchanged polls:** the poller published on every tick, so an unchanged Amazon Music session pushed redundant frames. `poll_once` now publishes only when the source value differs from the last *published* state (`state.current`, not the OS fetch); `ws_does_not_duplicate_frames_when_unchanged` pins `poll_once` returning `false` and the client receiving no new frame when the value is unchanged.
- **`aiService.toAnnotations`:** previously kept annotations even when they no longer matched any lyric line (e.g. AI returned a different wording); now drops annotations whose non-empty `lineRef` does not exactly match a line (`lines.find((l) => l.text === lineRef && !l.annotationId)`) — one per line at most, ids `ai-ann-<idx>`, `verifiedBy: "AI Synthesized"`.
- **`isAIConfigured`:** was comparing raw fields, so a config with blank/whitespace `providerUrl`/`model`/`apiKey` counted as configured; now trims before evaluating.
- **Time-formatting decisions pinned by tests:** `parseLrc` accepts sub-second fractional digits (e.g. `[00:01.050]` → 1050 ms) but single-digit fractions (`[00:01.5]`) are intentionally not parseable; cache TTL is strictly `> 7 days`.

### Known gaps / limitations
- **SMTC cannot be mocked:** the poller injection (`spawn_poller_with`) + `BRIDGE_MOCK_SCRIPT` replaces live SMTC, so the real Windows SMTC path is covered by the unit-level source wrapper (`bridge/source/windows.rs`) but not end-to-end.
- **macOS/Linux adapters are fixture-tested only** (`nowplaying-cli` / `playerctl` parsers run everywhere); live validation deferred to Phase 8.
- **E2E uses a scripted now-playing source** rather than a live Amazon Music session; lyric fetches for unknown tracks go to the network and fall back via the existing cascade if offline.
- **Playwright browsers:** bundled Chromium download is unreliable (cdn.playwright.dev); the suite runs against system Chrome (`channel: 'chrome'` in `playwright.config.ts`). Edge is also available as a fallback.
- **`src-tauri/src/lib.rs` (0 %)** as noted above — GUI entry exercised only through E2E. **App.tsx is the lowest FE file (75.73 %)**; remaining branches are dev-only/debug UI paths.

### Commands
- `npm run test` — Vitest unit/component suites (131).
- `npm run test:coverage` — Vitest with v8 coverage.
- `npm run coverage:report` — runs FE coverage + `cargo llvm-cov --json`, merges, enforces the ≥ 85 % combined gate.
- `npm run test:e2e` — Playwright (builds UI + bridge, spawns bridge with mock script, runs 8 tests).
- `cd src-tauri && cargo test` ; `cargo fmt --check` ; `cargo clippy --all-targets` — Rust gates.
- Smoke scripts unchanged: `npm run smoke`, `npm run bridge:smoke`.