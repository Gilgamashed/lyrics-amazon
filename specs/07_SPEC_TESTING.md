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

- [ ] Vitest + jsdom + Testing Library are configured; `npm run test` runs the unit/component suites.
- [ ] Frontend service unit tests pass (`lyricsService`, `lyricsCache`, `aiService`, `aiLyricsStore`, `bridgeService`).
- [ ] Frontend component/state tests pass (`AmazonMusicBar` indicator, `OptionsMenu`, lyric views, `App` timing + bridge events).
- [ ] Frontend network-resiliency tests pass (provider timeouts, errors, and malformed payloads fall through the cascade gracefully).
- [ ] Rust unit tests pass: `NowPlaying` schema, sanitizers/formatters, and macOS/Linux metadata parsers (fixtures, runnable on Windows).
- [ ] Rust integration tests pass: `/health`, `/now-playing`, `/ws` snapshot + push via `MockNowPlayingSource`, localhost-only binding, port-in-use and client-disconnect paths.
- [ ] E2E suite passes: real bridge binary + mock script + headless browser assert badge, detected track, lyrics load, playback sync, track change, and graceful degradation after the bridge is killed.
- [ ] Browser-origin HTTP/WS access to the bridge is verified; any missing CORS headers found are fixed (localhost-only) and covered by tests.
- [ ] Combined line coverage is ≥ 85% (Vitest v8 + `cargo-llvm-cov`), with documented aggregation, per-side reporting, and exclusions.
- [ ] `npm run lint`, `cargo fmt --check`, `cargo clippy --all-targets`, and `cargo test` pass with test code included.
- [ ] The existing smoke scripts (`npm run smoke`, `npm run bridge:smoke`) still pass.
- [ ] README documents all testing commands, the coverage policy, and the E2E harness.
- [ ] Findings are recorded in §6 (coverage table, uncovered bugs, and known limitations).
- [ ] `specs/PROJECT_OVERVIEW.MD` reflects the 8-phase roadmap (Testing = Phase 7; Hardening & Release = Phase 8); `specs/PROMPTS.md` records this phase.
- [ ] No Phase 8 features were introduced during this phase.

## 5. Deferred / TODO

- **Packaged-app E2E:** driving the real Tauri window (tauri-driver/WebdriverIO, `msedgedriver`) is deferred to Phase 8; the Playwright harness covers the full frontend↔bridge contract without it.
- **CI automation:** running the suites in CI (e.g., a Windows GitHub Actions runner) belongs to Phase 8 release hardening.
- **Advanced testing:** property/fuzz testing of the parsers, visual regression of the floating window, and load/performance testing are not part of this phase.
- **Cross-platform runtime validation:** macOS MediaRemote and Linux MPRIS adapters remain fixture/unit-tested only; live validation is deferred to Phase 8.

## 6. Findings (recorded during execution)

> This section is filled in when the suites are implemented and run. It must contain at least the table below plus a short list of bugs uncovered and known gaps; the DoD is not complete while this section is empty.

| Suite | Instrumented lines | Covered | Coverage |
| :--- | ---: | ---: | ---: |
| Frontend (Vitest v8) | — | — | — |
| Rust core (`cargo-llvm-cov`) | — | — | — |
| **Combined (gate: ≥ 85%)** | — | — | — |

Known gaps / limitations: _(to be recorded — e.g., SMTC cannot be mocked, macOS/Linux adapters fixture-tested only, E2E uses a mock now-playing source rather than a live Amazon Music session)._