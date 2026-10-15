# PROMPTS.md — AI Prompt & Decision History

## How to fill this file

- **Purpose:** Chronologically record every AI prompt/decision that changed the project (required by SpecDD and DoD #8 of `01_SPEC_SCAFFOLD.md`).
- **When to add:** After each accepted AI-assisted decision or spec step (e.g., a spec is drafted or revised, or code is generated).

### Fields

| Field | What to write |
| :--- | :--- |
| `**Tool:**` | AI tool + model used (e.g., Gemini, Claude, Copilot). |
| `**Context:**` | Which spec/task motivated the change (reference the spec file). |
| `**Prompt:**` | What was asked. |
| `**Result:**` | What was generated, or why it was rejected. |
| `**Human Review:**` | What the human team validated/changed. |

### Rules

- Append entries chronologically (newest at the bottom), each titled with the `[AAAA-MM-DD]` date prefix.
- Always reference the relevant spec file (e.g., `specs/0N_SPEC_*.md`).
- Keep entries factual and concise; include code only where it illustrates the decision.

---

## EXAMPLE

```markdown
## [AAAA-MM-DD] Short Title

- **Tool:** <Tool name/model>
- **Context:** <Which spec/task motivated change>
- **Prompt:** <What was asked>
- **Result:** <What was generated, or why was it rejected>
- **Human Review:** <What was validated/changed by the human team>
```

---

## History

## [2026-10-11] Create project overview for lyrics-for-amazon

- **Tool:** OpenAI Codex
- **Context:** Replace the SynapseShop template in `specs/PROJECT_OVERVIEW.MD` with an overview of the Lyrics for Amazon Music project per the 7-phase roadmap.
- **Prompt:** "Based on specs/PROJECT_OVERVIEW.MD create a new PROJECT_OVERVIEW.MD file containing info pertaining to the lyrics-for-amazon project..."
- **Result:** New `specs/PROJECT_OVERVIEW.MD` (English, 6-layer architecture, 7-phase roadmap, provider-agnostic AI placeholder, native companion bridge for desktop-app detection).
- **Human Review:** Approved two decisions: provider-agnostic AI fallback adapter; native companion bridge (SMTC/MediaRemote/MPRIS) for desktop-app track detection.

## [2026-10-11] Adapt AI-SAFE guideline to the lyrics project

- **Tool:** OpenAI Codex
- **Context:** `specs/00_AI-SAFE.md` still referenced the unrelated "PoggingTime" project.
- **Prompt:** "Let's edit the specs/00_AI-SAFE.md to adapt to the realities of our lyrics project too."
- **Result:** Rewrote §1–§3 to reference Lyrics for Amazon Music, `specs/PROJECT_OVERVIEW.MD`, the 7-phase roadmap, the `NN_SPEC_NAME.md` file convention, and updated Anticipation-Ban examples.
- **Human Review:** Approved; confirmed naming convention `NN_SPEC_NAME.md`.

## [2026-10-11] Draft Phase 1 scaffold spec

- **Tool:** OpenAI Codex
- **Context:** Begin SpecDD execution with Phase 1 (scaffolding) of the roadmap.
- **Prompt:** "Create a 01_SPEC_SCAFFOLD.md file that focuses on phase 1... sections: Objective, Context, Tasks and Responsibilities, and a Definition of Done."
- **Result:** Created `specs/01_SPEC_SCAFFOLD.md` with gap-closure framing (repo already exceeded a pure scaffold).
- **Human Review:** Approved the "Spec + gap-closure" framing over greenfield-only.

## [2026-10-11] Add PROMPTS.md fill instructions

- **Tool:** OpenAI Codex
- **Context:** `specs/PROMPTS.md` contained only an EXAMPLE template; DoD #8 requires a seeded prompt history.
- **Prompt:** "Let's add instructions on how to fill the PROMPT.md - follow the example found in the file itself."
- **Result:** Added "How to fill this file" section (purpose, fields table, chronological rules), fixed typos, and seeded the history with decisions recorded so far.
- **Human Review:** Approved chronological (append) ordering and typo fixes.

## [2026-10-12] Draft Phase 2 lyric engine spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 2 (core lyric engine) of the roadmap.
- **Prompt:** "Let's create a 02_SPEC_SCAFFOLD.md file that focuses on phase 2 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md."
- **Result:** Created `specs/02_SPEC_LYRIC_ENGINE.md` (Objective, Context with gap-closure, Tasks & Responsibilities, DoD); renamed to `02_SPEC_LYRIC_ENGINE.md` to match the roadmap area.
- **Human Review:** Confirmed filename `02_SPEC_LYRIC_ENGINE.md`; DoD audit marked all items done via code inspection + lint.

## [2026-10-12] Add in-memory cache and smoke verification for the lyric engine

- **Tool:** OpenAI Codex
- **Context:** Phase 2 (`specs/02_SPEC_LYRIC_ENGINE.md`) DoD review; user proposed caching recently played song data and running runtime smoke-verification with/without cache.
- **Prompt:** "I'm considering adding a cache for recently played song data and run runtime smoke-verification with and without cache, documenting the finding in the README.md. How should we approach this?"
- **Result:** Added `src/services/lyricsCache.ts` (memory-only, bounded 20 entries, 7-day TTL, `title|artist` key, `useCache` bypass in `fetchLyrics`), `scripts/smoke-lyrics.ts` (`npm run smoke`), README "Lyrics Cache" + "Runtime Smoke-Verification" sections with measured timings, and updated the Phase 2 spec DoD.
- **Human Review:** Approved scope (lyrics-only), persistence (memory-only), and live smoke run. Live result: cache hit 0 ms vs 400 ms cold fetch.

## [2026-10-12] Draft Phase 3 floating window spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 3 (floating window UX) of the roadmap.
- **Prompt:** "Let's create a 03_SPEC_UX.md file that focuses on phase 3 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md." — then "Let's proceed using the 03_SPEC_FLOATING_WINDOW.md file name."
- **Result:** Created `specs/03_SPEC_FLOATING_WINDOW.md` (Objective, Context with gap-closure, Tasks & Responsibilities, DoD) covering drag/resize glass window, opacity/blur/pin/minimize/presets, karaoke and full-sheet modes, and the Genius annotations drawer.
- **Human Review:** Chose filename `03_SPEC_FLOATING_WINDOW.md` (per `00_AI-SAFE.md` example); approved gap-closure framing with all DoD items checked.

## [2026-10-12] Draft Phase 4 playback sync spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 4 (playback sync) of the roadmap.
- **Prompt:** "Now, let's create a 04_SPEC_LYRICSYNC.md file that focuses on phase 4 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md."
- **Result:** Created `specs/04_SPEC_LYRICSYNC.md` (Objective, Context with gap-closure, Tasks & Responsibilities, DoD) covering the playback timer, media-session integration (metadata + play/pause/seekto), and `±0.5s`/`±0.1s` offset calibration.
- **Human Review:** Confirmed filename `04_SPEC_LYRICSYNC.md`; approved gap-closure framing with all DoD items checked.

## [2026-10-12] Draft Phase 5 AI fallback spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 5 (customizable AI fallback) of the roadmap.
- **Prompt:** "Now, let's create a 05_SPEC_AIFALLBACK.md file that focuses on phase 5 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md" — plus two personal additions: (1) users input their own API keys in an options menu; (2) AI-generated lyrics saved locally permanently.
- **Result:** Created `specs/05_SPEC_AIFALLBACK.md` (Objective, Context, Tasks & Responsibilities, DoD, Deferred/TODO), framed as forward-looking (unchecked DoD) since Phase 5 is not yet implemented.
- **Human Review:** Chose direct browser fetch (no proxy); session-only API key with a deferred TODO to research more secure handling; AI-only localStorage persistence (no TTL).

## [2026-10-12] Implement Phase 5 AI fallback

- **Tool:** OpenAI Codex
- **Context:** Execute the `specs/05_SPEC_AIFALLBACK.md` DoD; the spec was amended first to reflect the key-security decision.
- **Prompt:** "let's execute" (following the agreed plan of action: amend spec, foundations, AI services, integration, UI, docs).
- **Result:** Added `AIConfig` type; `src/services/aiService.ts` (`resolveAIConfig` + `synthesizeLyrics` over an OpenAI-compatible `chat/completions` endpoint); `src/services/aiLyricsStore.ts` (permanent, AI-only `localStorage`); integrated AI into the `fetchLyrics` cascade (curated → LRCLIB → AI-store → AI-call → canned); new `src/components/OptionsMenu.tsx` (masked, session-only key) wired into `AmazonMusicBar` and `App`; updated `.env.example` (endpoint/model only) and README. All DoD items checked.
- **Human Review:** Env carries only non-secret endpoint/model; the API key is entered at runtime and never bundled — server-side proxy remains the documented secure alternative (deferred). `npm run lint` and `npm run build` pass.

## [2026-10-12] Draft Phase 6 native companion bridge spec

- **Tool:** OpenAI Codex
- **Context:** Continue SpecDD execution with Phase 6 (native companion bridge / desktop-app track detection) of the roadmap.
- **Prompt:** "Now, let's create a 06_SPEC_DETECTION.md file that focuses on phase 6 of the PROJECT_OVERVIEW.MD, following the same pattern as the 01_SPEC_SCAFFOLD.md."
- **Result:** Created `specs/06_SPEC_DETECTION.md` (Objective, Context, Tasks & Responsibilities, DoD, Deferred/TODO), framed as forward-looking (unchecked DoD) since Phase 6 is not implemented.
- **Human Review:** Chose Tauri v2 shell with a Rust-native bridge in the Tauri core; localhost WebSocket + HTTP transport; Windows-first (SMTC) with macOS/Linux adapters; full cross-platform validation deferred to Phase 7.

## [2026-10-12] Phase 6 toolchain decision and Rust setup

- **Tool:** opencode (big-pickle)
- **Context:** `specs/06_SPEC_DETECTION.md` requires a Rust/Tauri build; no Rust toolchain was installed.
- **Prompt:** "let's proceed" (plan Part 0: environment setup).
- **Result:** `winget` hung, so `rustup-init.exe` was downloaded directly from `win.rustup.rs` and installed stable 1.99.0 (MSVC). A throwaway crate plus the full Tauri dependency tree compiled and linked against the existing **VS2017 MSVC 14.16 + Windows SDK 10.0.26100**, so no VS2022 Build Tools install was needed.
- **Human Review:** Confirmed VS2017-first decision held; fallback (VS2022 Build Tools) remains documented but unused.

## [2026-10-12] Implement Phase 6 native companion bridge

- **Tool:** opencode (big-pickle)
- **Context:** Execute the `specs/06_SPEC_DETECTION.md` DoD (all tasks in §3).
- **Prompt:** "let's proceed" (approved plan: Tauri scaffold → Rust bridge → frontend integration → docs/verification).
- **Result:** Added `@tauri-apps/cli`/`@tauri-apps/api` ^2 and a Tauri v2 scaffold (`src-tauri/`, identifier `com.lyrics.amazonmusic`, devUrl `http://localhost:3000`). Rust bridge in `src-tauri/src/bridge/`: `NowPlaying` schema (camelCase JSON), `NowPlayingSource` common trait, `windows.rs` (SMTC via `windows-rs` 0.62: MTA COM init, 1s poll, thread-parking `block_on` for `IntoFuture` async ops), `macos.rs` (`nowplaying-cli get-raw` JSON), `linux.rs` (`playerctl` MPRIS), and an axum server on `127.0.0.1:48765` (`GET /health`, `GET /now-playing`, `GET /ws` push via broadcast, 1s diff polling). Frontend: `src/services/bridgeService.ts` (WS client with exponential backoff + HTTP snapshot), `App.tsx` desktop-track mapping into `Song`/playback + auto lyrics load, `AmazonMusicBar` Desktop (native) vs Browser (Media Session) indicator, `.env.example` `VITE_BRIDGE_URL`, new `scripts/smoke-bridge.ts` (`npm run bridge:smoke`), Tauri npm scripts, README docs.
- **Human Review:** All 13 DoD items checked. `npm run lint`, `npm run build`, `cargo clippy --all-targets`, `cargo build` pass; live smoke run PASS (bridge detected a real Windows SMTC session over HTTP + WS). No Phase 7 features introduced.

## [2026-10-12] Draft Phase 7 testing spec

- **Tool:** opencode (big-pickle)
- **Context:** Introduce a dedicated testing phase covering metadata parsers, state machine/timing, API resiliency, and frontend↔backend E2E, targeting ≥ 85% coverage with documented findings.
- **Prompt:** "Let's come up with a 07_SPEC_TESTING.md file that will follow the 01_SPEC_SCAFFOLD.md pattern to come up with a full testing spec to cover 85% of the project and document its findings."
- **Result:** Created `specs/07_SPEC_TESTING.md` (Objective, Context with testable-surface inventory + test seams, Tasks for Rust unit/integration, Vitest unit/component, Playwright real-bridge E2E, DoD, Deferred, and a Findings section to fill during execution). Renumbered the roadmap to 8 phases: Testing = Phase 7, Hardening & Release = Phase 8; updated `specs/PROJECT_OVERVIEW.MD`, `specs/00_AI-SAFE.md`, and the phase headers of specs 01–06.
- **Human Review:** Chose spec-only for now (implementation next); real bridge binary + headless browser over tauri-driver for E2E; combined 85% line coverage with minimal dependencies (fetch stubs/fixtures instead of `msw`); test seams declared (injectable `NowPlayingSource`, platform-neutral parser extraction, `BRIDGE_MOCK_SCRIPT`) with no runtime behavior change.
## [2026-10-12] Implement Phase 7 automated testing

- **Tool:** opencode (big-pickle)
- **Context:** Execute the `specs/07_SPEC_TESTING.md` DoD (all tasks in section 3).
- **Prompt:** "proceed" (approved plan: Rust seams + tests first, then Vitest services, components/App, combined coverage gate, Playwright E2E, docs/final gates).
- **Result:** Added Vitest + jsdom + Testing Library (+ fake timers, fake-indexeddb) and Playwright as dev deps; `src/test/setup.ts` + `src/test/fixtures.ts`; `cargo-llvm-cov`. Rust: extracted platform-neutral `parse_nowplaying_cli_json()` / `parse_playerctl_metadata()`, split `build_router`/`serve`, added `spawn_poller_with(_interval)`, `BridgeState`, and env-gated `BRIDGE_MOCK_SCRIPT` (camelCase `{ holdMs, nowPlaying }` steps, looped) � 36 tests green, `cargo fmt --check`/`clippy --all-targets` clean. Frontend: 131 tests (5 services, 7 components, App state machine) with fetch stubs; final FE line coverage 91.99%. Created `scripts/coverage-report.ts` (`npm run coverage:report`) merging Vitest v8 + `cargo llvm-cov --json` into a combined >= 85% gate � PASS, combined 92.81% (FE 1274/1172, Rust 937/880), exclusions limited to `src/main.tsx`, `*.test.*`, `src/test/**`, `main.rs`, `build.rs`, `src-tauri/gen/**`. Playwright E2E (8 tests): builds UI + real bridge binary, spawns it with `BRIDGE_MOCK_SCRIPT`, drives system Chrome (`channel: "chrome"`; bundled Chromium DL flaky), asserts badge/track/lyrics/WS stream/degradation. Bug fixes surfaced: localhost-only CORS layer on the bridge (was missing), WS frame dedupe on unchanged polls, `toAnnotations` lineRef matching, `isAIConfigured` trimming. Documented findings + checked DoD in `specs/07_SPEC_TESTING.md`; README Testing section + script table; this PROMPTS entry.
- **Human Review:** Combined coverage kept above the 85% hard gate; E2E pinned to system Chrome to avoid the Playwright CDN; `BRIDGE_MOCK_SCRIPT` unset leaves the bridge byte-for-byte Phase-6 behavior; all work left uncommitted on `dev`.

## [2026-10-13] Implement Phase 8 hardening and release (MVP close-out)

- **Tool:** opencode (big-pickle)
- **Context:** Execute the `specs/08_SPEC_HARDENING.md` DoD (final phase / MVP close-out). User decisions: yes to CI with macOS/Ubuntu matrix jobs, `taiki-e/install-action@cargo-llvm-cov` for the coverage gate on CI, CI push trigger limited to `dev` (nothing pushed to `main`), and if the WiX/MSI build had failed, stop and ask before falling back.
- **Prompt:** "let's proceed" (approved plan: local gates -> tauri:build -> packaged-app verification -> CI workflow -> docs/MVP close-out -> final demo -> commits + push to dev only).
- **Result:** All 10 local gates re-run green (lint, build, 131 Vitest, 36 Rust, fmt, clippy, 92.81% coverage gate, 8 E2E, smoke, bridge:smoke). `npm run tauri:build` produced the Windows installers: NSIS `Amazon Music Floating Lyrics_0.1.0_x64-setup.exe` (2.17 MiB) and MSI `Amazon Music Floating Lyrics_0.1.0_x64_en-US.msi` (3.23 MiB) � WiX succeeded, no fallback needed. Packaged app verified: release binary launched, `/health` OK, `/now-playing` returned a live SMTC snapshot, `npm run bridge:smoke` PASS, process cleaned up. Added `.github/workflows/ci.yml`: `quality-gates` on `windows-latest` (lint, build, vitest, coverage gate, fmt, clippy, cargo test, Playwright E2E with system Chrome) and `platform-matrix` on `macos-latest`/`ubuntu-latest` (lint + build + cargo test; Ubuntu installs Tauri system deps); triggers = push to `dev`, pull_request, workflow_dispatch; secrets-free; npm + cargo caches. Docs/MVP close-out: README status -> Phase 8 (MVP complete) plus new "Packaging & Release" and "CI" sections; `PROJECT_OVERVIEW.MD` �4 MVP bullets -> checked; `08_SPEC_HARDENING.md` DoD checked; this entry. Final-demo evidence recorded: E2E suite green (curated-track boot, Desktop badge, track switch, unknown-track mapping, WS stream, degradation) + packaged-app launch/bridge:smoke PASS + live LRCLIB smoke PASS. Commits pushed to `origin/dev` only.
- **Human Review:** Approved CI trigger scoped to `dev` (no `main` pushes yet), third-party `taiki-e` action for cargo-llvm-cov, and NSIS/MSI unsigned-by-design (signing deferred to post-MVP backlog per spec 08 �5).

## [2026-10-13] Draft post-MVP app-packaging spec (live-test readiness)

- **Tool:** opencode (big-pickle)
- **Context:** Begin the post-MVP track (following `specs/08_SPEC_HARDENING.md` §5) with the first post-MVP spec: prepare the app for live testing by packaging and distributing an installable, self-updating Windows build.
- **Prompt:** "let's proceed with the creation of the first post-mvp spec: 09_SPEC_POSTMVP-APP-PACK.md in which the goal of preparing the app for live testing is adressed." — plus scope decisions: Windows only; unsigned + tester bypass guide; include the Tauri updater; tag-triggered CI → GitHub Release; minimal tester docs (README install section); keep current in-app AI key entry; target version 0.2.0.
- **Result:** Created `specs/09_SPEC_POSTMVP-APP-PACK.md` (Objective, Context inheriting the Phase 8 backlog + current packaging state, Tasks covering Windows packaging/versioning, Tauri updater wiring, a `v*`-tagged `release.yml` publishing to GitHub Releases, minimal tester docs, and quality/code-safety, DoD, Deferred/TODO). Key technical note captured: the Tauri updater signs its own artifacts with a `tauri signer generate` (minisign) keypair — independent of Windows Authenticode — so unsigned installers can auto-update; and the Windows updater supports NSIS only (not MSI), making the NSIS `.exe` the tester artifact of record. Noted the existing version mismatch (`package.json` 0.0.0 vs `tauri.conf.json`/`Cargo.toml` 0.1.0) to be unified at 0.2.0.
- **Human Review:** Chose Windows-only, unsigned with a documented SmartScreen bypass, Tauri auto-update, tag-triggered GitHub Release distribution, minimal docs, unchanged AI key handling, and target version 0.2.0 (tag `v0.2.0`).

## [2026-10-13] Implement post-MVP app packaging (local scope, no publishing)

- **Tool:** opencode (big-pickle)
- **Context:** Execute the locally-achievable portion of the `specs/09_SPEC_POSTMVP-APP-PACK.md` DoD. User decisions: host tester builds on **public GitHub Releases** (the repo is currently private); **no publishing yet** (no repo-visibility flip, no tags, no Releases, no CI secrets); generate the updater keypair **with a password**; **skip the live update test**; and make the updater **prompt before installing**.
- **Prompt:** "Let's proceed, password testestest" (approved plan: version unify → keypair → Rust/config updater wiring → release workflow → README → local verification → DoD close-out).
- **Result:** Version unified at `0.2.0` (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` + `Cargo.lock`). Generated a password-protected minisign keypair (`tauri signer generate`) at `%USERPROFILE%\.tauri\lyrics-amazon.key`; committed only the public key. Rust: added `tauri-plugin-updater` + `tauri-plugin-dialog`, registered both, and added a release-only (no-op in dev) launch check in `src-tauri/src/lib.rs` that queries the endpoint, shows an **Update / Later** dialog, and on confirm downloads, installs, and relaunches — degrading quietly (log-only) offline/unconfigured. Config: `bundle.createUpdaterArtifacts = true`, `plugins.updater` (public key + `…/releases/latest/download/latest.json`, `windows.installMode = passive`), and the `updater:default` capability. Added dormant `.github/workflows/release.yml` (tags `v*`, `windows-latest`, `tauri-apps/tauri-action@v1`, `updaterJsonPreferNsis: true`, `permissions: contents: write`). README: new "Install for Testing" section (download → install → SmartScreen bypass → auto-update) and a second-workflow note. Verification: all gates green — `npm run lint`, `npm run build`, 131 Vitest, combined coverage **90.61%** ≥ 85% (Rust 88.86%), `cargo fmt --check`, `cargo clippy --all-targets`, 36 Rust tests, 8 Playwright E2E, `npm run smoke` (LRCLIB), `npm run bridge:smoke` (PASS) — and a **signed** `npm run tauri:build` produced `Amazon Music Floating Lyrics_0.2.0_x64-setup.exe` (3.22 MiB, NSIS) + `…_0.2.0_x64_en-US.msi` (4.67 MiB) with both `.sig` updater artifacts. DoD: locally-achievable items checked; publishing/live-update items left unchecked with a **go-live runbook** added to spec 09.
- **Human Review:** Confirmed no secrets committed (public key only; private key outside the repo) and no scope creep (no detection/lyrics/AI/UI/bridge behavior changes; no signed/notarized or macOS/Linux artifacts). Note: a `coverage:report` run briefly reported a false 77% because a moved `src-tauri/target` lost its `CACHEDIR.TAG`, causing stale profile merging; a clean run restored 90.61%.

## [2026-10-13] Publish + live-verify the in-app auto-update (v0.2.0 → v0.2.1)

- **Tool:** opencode (big-pickle)
- **Context:** Authorized go-live for `specs/09_SPEC_POSTMVP-APP-PACK.md`: publish the tester build and observe a real in-app update. Also requested a small translucent version annotation in the app window from `0.2.1` onward.
- **Prompt:** "proceed with the publishing… and add a small translucent version annotation at the bottom-right of the app window from 0.2.1 onwards".
- **Result:** Made the repo public, set the CI secrets, and tagged `v0.2.0` → release run `38438472869` green (6m32s); verified the public Release assets (NSIS `…_0.2.0_x64-setup.exe` 3,380,486 B + `.sig`, MSI + `.sig`, `latest.json`) and installed it silently to `%LOCALAPPDATA%\Amazon Music Floating Lyrics\`. Version bumped `0.2.0 → 0.2.1` across `package.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`; injected `__APP_VERSION__` via `define` in `vite.config.ts` + `vitest.config.ts`; added `src/appVersion.ts` and a bottom-right `data-testid="app-version"` annotation in `src/App.tsx` (+ a Vitest assertion). All gates green (lint after clearing stale `tauri-codegen-assets`; 132 Vitest; `cargo fmt`/`clippy`; 36 Rust; 8 E2E; `smoke`; `bridge:smoke`; combined coverage **90.79%**) and a signed `tauri:build` produced `…_0.2.1_x64-setup.exe` (3,382,013 B) + MSI + both `.sig`. Commits `20d9a18` + `b7ae2fe` pushed to `dev`; tag `v0.2.1` → release run `38444808696` green; public `latest.json` → `0.2.1`. **Live update observed:** installed `0.2.0` prompted on launch → in-app **Update** → downloaded the signed `0.2.1` NSIS installer (to a temp `…-0.2.1-updater-*` dir) → installed → relaunched as `0.2.1` (`/health` = `ok`, `/now-playing` live).
- **Human Review:** Confirmed all spec-09 DoD items now checked (publishing + live update verified) and README/spec/PROMPTS updated. Note: the very first live-update attempt did not complete (the installer launched but the version stayed `0.2.0`); a clean re-run (0.2.0 → in-app Update → 0.2.1) succeeded and relaunched the app, so the updater path is confirmed working.

## [2026-10-13] Draft post-MVP minor-patch spec (lyrics fallback & UX)

- **Tool:** opencode (big-pickle)
- **Context:** Turn a short user note (`specs/10_SPEC_POSTMVP-MIN-PATCH.md`, four bullet ideas) into a full SpecDD spec following the `09_SPEC_POSTMVP-APP-PACK.md` pattern, for future implementation.
- **Prompt:** "Let's prepare 10_SPEC_POSTMVP-MIN-PATCH.md as a spec for future use following the same pattern as the previous ones." — with scope decisions: one bundled spec; add a **real Genius** source; providers resolve lyrics via **public sources** whenever an API is key-gated or returns no lyric text (uniform across all providers); a genuine **"Lyrics not found"** state shown only when the whole chain fails; **auto-prefer the Amazon Music** session (Windows-first); **per-song** thumbs up/down; land on `dev` with **no version bump/release**.
- **Result:** Wrote `specs/10_SPEC_POSTMVP-MIN-PATCH.md` (Objective, Context with the current `lyricsService`/bridge/feedback state and the accepted key decisions, Tasks covering a Genius provider + not-found state, a multi-provider chain before AI, Amazon Music session prioritization, and per-song feedback, DoD, Deferred/TODO). Grounded the Context in the real code seams: `lyricsService.ts` (curated → LRCLIB → saved AI → AI synth → fabricated `createFallbackLyrics`), `types/lyrics.ts` `provider` union, `aiLyricsStore.ts`/`lyricsCache.ts` persistence patterns, `App.tsx` detection switch, and `bridge/source/windows.rs` `GetCurrentSession()`.
- **Human Review:** Confirmed the bundled scope, the uniform public-source provider policy (scraping documented as fragile-by-design), Windows-first source prioritization, per-song (not per-line) voting, and dev-only/no-version-bump delivery. Spec is written and untracked (not committed) pending implementation.

## [2026-10-13] Implement post-MVP minor patch (Genius, provider chain, source priority, thumbs feedback)

- **Tool:** opencode (big-pickle)
- **Context:** Execute the `specs/10_SPEC_POSTMVP-MIN-PATCH.md` DoD on the `dev` branch only (no version bump, tag, or release). User decisions collected up front: (1) Genius via its **public search endpoint** (`/api/search/song?q=…`, then scrape the song page); (2) thumbs-up results carry the **top** lookup priority → order is **user-accepted → curated → provider chain → saved AI → AI**; (3) thumbs-down advances the **full pipeline** (Genius…musixmatch → AI) then falls through to not-found; (4) keep the bridge `NowPlaying.source` field as-is (no payload schema change).
- **Prompt:** "What did we do so far?" → continue the implementation and finish the gates/docs.
- **Result:** New files: `src/services/userLyricsStore.ts` (localStorage accepted lyrics, `title|artist` key, `lyrics-amazon:user-accepted-lyrics:v1`) and `src/services/lrcParser.ts` (extracted `parseLrc`), plus `src/services/providers/{types,base,lrclib,genius,azlyrics,letras,musixmatch,chain}.ts` (ordered **Genius → LRCLIB → azlyrics → letras.mus.br → musixmatch**, per-provider AbortController timeout + error isolation, each degrading to the next; `runProviderChain` prefers the first **synchronized** result and retains the first **plain-only** result as fallback, returning `{ result, usedIndex, exhausted }`). `src/services/lyricsService.ts` rewritten: accepted → curated → chain → saved AI → AI → **`null`**; fabricated `createFallbackLyrics()` removed; `fetchLyrics` now returns `LyricsData | null` with `FetchLyricsOptions { useCache?, aiConfig?, startFromIndex? }`. `src/types/lyrics.ts` `provider` union extended (`Genius | LRCLIB | azlyrics | letras.mus.br | musixmatch | AI Sync | Amazon Music | None`). UI: `KaraokeLyricsView`/`FullSheetLyricsView` gained `isLoading` + genuine **"Lyrics not found"** states (plain-only renders as Full Sheet; App auto-switches `viewMode` on sync presence); `FloatingLyricsWindow` gained the thumbs control (`data-testid="thumbs-up"/"thumbs-down"`, `aria-pressed`) and `isLoadingLyrics`/`feedbackState`/`onThumbsUp`/`onThumbsDown`; `App.tsx` wires `loadLyrics(…, startFromIndex)`, `lastProviderIndexRef`, `handleThumbsUp`→`saveAcceptedLyrics`, `handleThumbsDown`→next provider. Rust: `bridge/source/windows.rs` now enumerates SMTC sessions and **prefers a playing Amazon Music** session (else the current session), with `macos.rs`/`linux.rs` mirrored (`is_amazon_app`/`is_amazon_player` + preferred-session helpers); added `windows-collections = 0.3.2`. `tsconfig.json` excludes `src-tauri` (stale `tauri-codegen-assets` TS1490). Tests: new `providers/chain.test.ts`, `providers/adapters.test.ts`, `providers/fetch.test.ts`, `userLyricsStore.test.ts` + not-found/thumbs component tests + updated `lyricsService.test.ts` (null contract, accepted priority, `startFromIndex`) and `smoke-lyrics.ts` (null-safe). **All gates green:** `npm run lint`, `npm run build`, **172 Vitest** (was 132), combined coverage **90.13%** ≥ 85% (FE 90.69%, Rust 89.18%), `cargo fmt --check`, `cargo clippy --all-targets`, **38 Rust tests** (was 36), **8 Playwright E2E**, `npm run smoke` (chain returned LRCLIB synced), `npm run bridge:smoke` (PASS). Spec-10 DoD checked; README + `PROJECT_OVERVIEW.MD` updated. No version bump/tag/release; no §5 deferred items introduced; no secrets committed.
- **Human Review:** Confirmed the four locked decisions above, the dev-only/no-version-bump delivery, and that the change stays within the four declared improvements (no floating-window ergonomics, karaoke/sheet contracts, sync calibration, or bridge-transport changes beyond source selection).

## [2026-10-15] Start the staging branch and enable tag-based pre-releases (0.3.0)

- **Tool:** opencode (big-pickle)
- **Context:** With spec 10 landed on `dev`, stand up the release-candidate track: a long-lived **`staging`** branch where the next version is staged. Decisions locked before touching anything: cut the branch from **`dev`**; bump **`0.2.1 → 0.3.0`** on **both `staging` and `dev`**; automation is **CI + tag-based pre-releases**; cut the first pre-release **`v0.3.0-rc.1`** immediately; document it in **docs only** (no new spec). `origin/main` is stale (Phase 1 only) and promoting `staging → main` was explicitly out of scope.
- **Prompt:** "let's proceed" (approved plan: 4-file version bump → CI/release workflow changes → create + push `staging` → tag `v0.3.0-rc.1` → verify → docs).
- **Result:** Two commits pushed to `dev`. `6f7a2c9` `chore(release): bump 0.2.1 -> 0.3.0` across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` — root package only, mirroring the earlier `b7ae2fe` 0.2.1 bump (that one touched the same 4 files); `package-lock.json` deliberately left at `0.0.0`. `e0ac315` `ci: run quality gates on staging and treat rc tags as pre-releases`: `ci.yml` push branches now `[dev, staging]`; `release.yml` sets `prerelease: ${{ contains(github.ref_name, '-') }}` with a matching conditional `releaseBody` (staging/testing-only wording for dash tags, the existing wording otherwise), so any `vX.Y.Z-rc.N` tag publishes as a GitHub pre-release while a plain `vX.Y.Z` stays a full release. `staging` created at `e0ac315`, pushed, and set to track `origin/staging`; annotated tag `v0.3.0-rc.1` cut at `e0ac315` and pushed. **Verified live:** `release` run **`38760514922`** success → `v0.3.0-rc.1` published with `prerelease: true` / `draft: false`, 5 assets (`Amazon.Music.Floating.Lyrics_0.3.0_x64-setup.exe` + `.sig`, `…_x64_en-US.msi` + `.sig`, and `latest.json` declaring `version: 0.3.0`), and the pre-release body text; `releases/latest` still resolves to **`v0.2.1`** (`prerelease: false`), so the in-app updater — which reads `releases/latest/download/latest.json` — never offers an rc. CI ran on **`staging`** for the first time (`38760466265`) and on `dev` (`38760433105`, success, all 3 jobs). The first staging attempt failed both of its heavy jobs on **runner timing flakes unrelated to the change** (the same commit `e0ac315` was green on `dev`): Windows E2E test 1 (`app.spec.ts:15` "boots into the curated Espresso track") hit its 15s banner timeout while the runner was loaded (sibling tests took 32.8s and 39.3s; the other 7 E2E tests passed), and macOS `bridge::source::tests::spawn_poller_with_publishes_from_an_injected_source` panicked with "poller failed to publish from the injected source within 2s". After `gh run rerun --failed`, **Windows passed** (flake confirmed) and Ubuntu stayed green; **macOS failed a second time on the same test**, which is pre-existing macOS-runner flakiness — it also failed on `dev` in runs `38339210671` / `38341584474`, each time on a different timing-sensitive test (`bind_bridge_resolves_to_localhost_fixed_port`, `mod.rs:478`). Docs updated with this entry: README gained a **Branching & Staging** subsection (plus CI/release-workflow notes naming the rc pre-release behavior) and `PROJECT_OVERVIEW.MD` gained a **Release flow** blockquote.
- **Human Review:** Confirmed the version bump touched only the four expected files (root `Cargo.lock` package entry, not dependencies; `package-lock.json` untouched), that `staging` and `dev` start at the same commit, and that the pre-release path is correct end-to-end (rc is a GitHub pre-release, `releases/latest` unchanged at `0.2.1`, so no existing user is auto-updated to `0.3.0-rc.1`). Net CI state: `dev` fully green; `staging` green except the known pre-existing macOS flake. Proposed follow-up (not done here, to keep this change limited to branch/workflow/docs): widen the two timing-sensitive budgets — `spawn_poller_with_publishes_from_an_injected_source`'s 2s publish deadline at `src-tauri/src/bridge/source/mod.rs:234` and the 15s E2E banner timeout at `e2e/app.spec.ts:21` — so a loaded runner stops turning them red.

## [2026-10-15] Fix the critical lyrics pipeline and ship v0.4.0 (spec 11)

- **Tool:** opencode (big-pickle)
- **Context:** Execute `specs/11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md` — live testers reported **no lyrics ever resolve**. Root causes diagnosed live: (1) `genius.ts` read `response.hits` but the real payload nests hits at `response.sections[].hits[]`, so Genius always returned empty; (2) every provider called the webview `fetch()` directly with **no CORS bypass**, so the packaged app (`http://tauri.localhost`) was blocked by Genius/`azlyrics`/`letras`/`musixmatch` (only LRCLIB sends `access-control-allow-origin: *`); (3) `lrclib.ts` used only `/api/get` (exact duration) with no `/api/search` fallback and no `429` handling; (4) `fetch.test.ts` mocked the **same wrong shape** as the bug. **Decisions revised during execution** (locked by the user): egress is a **Rust bridge `/fetch` proxy** (not `@tauri-apps/plugin-http`); the three HTML scrapers are **dropped** (chain is now **Genius → LRCLIB**); the live test is `tauri build --no-bundle`; bump to **0.4.0**. Also wrote `specs/12_SPEC_POSTMVP-UX-REDESIGN.md` (not executed).
- **Prompt:** "What did we do so far?" → continue implementation, run the gates, bump 0.4.0, commit to `dev`, and produce the packaged build for the live test.
- **Result:** New `src/services/httpClient.ts` — `httpFetch(url, init)` (**direct-first**, **bridge-fallback** on failure; skips the fallback when the caller aborted so timeouts don't double-fetch) + `bridgeProxyUrl`. `src/services/providers/genius.ts` rewritten: reads `response.sections[].hits[]` (flattened, with a `response.hits` fallback), fetches the song page through `httpFetch`, and extracts lyrics via a **balanced-`div` scan of every `data-lyrics-container="true"` block in DOM order** (joining in-read ad-split blocks), stripping the leading "Contributors/Translations" widget prefix and decoding HTML entities. `src/services/providers/lrclib.ts` rewritten: `/api/get` fast path → `/api/search` (normalized title+artist, **±3s** duration, prefer synced) with a **single 500ms backoff on `429`**. Deleted `providers/{azlyrics,letras,musixmatch}.ts`; `chain.ts` = **Genius → LRCLIB** (`DEFAULT_TIMEOUTS [4000,4000]`); `types/lyrics.ts` and `App.tsx` provider unions updated. Rust: `src-tauri/Cargo.toml` gains **`reqwest`** (`default-features=false`, `rustls-tls` + compression, so the macOS/ubuntu matrix needs no OpenSSL); `src-tauri/src/bridge/mod.rs` gains a **host-allowlisted `GET /fetch?url=` proxy** (`reqwest`, browser UA, 15s timeout, invalid-scheme + off-allow-list → `403`) plus `is_allowed_host`/`fetch_rejects...`/`fetch_proxies_allowed_upstream...` tests. Tests rewritten to reality: `fetch.test.ts` (real `sections[].hits[]`, LRCLIB search-fallback + 429-retry), `adapters.test.ts` (nested-div, multi-container order, widget strip, entity decode), `chain.test.ts`, `lyricsService.test.ts`, new `httpClient.test.ts`, and a new browser-context `e2e/egress.spec.ts` (CORS-blocked direct fetch + bridge `/fetch` succeeds + allow-list `403`; self-heals by respawning the bridge the "Graceful degradation" test kills). `scripts/smoke-lyrics.ts` now also asserts a **live Genius** parse. Version → **0.4.0** (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`). Spec 11 §2.3/§3.1/§3.4/§3.6/§4 revised to the delivered approach + 0.4.0; README and `PROJECT_OVERVIEW.MD` updated. **All gates green:** lint, build, **177** Vitest, combined coverage **91.01%** (FE 91.63% / Rust 90.10%, gate ≥85%), `cargo fmt --check`, `cargo clippy --all-targets`, **41** Rust tests, **10** Playwright E2E, `npm run smoke` **PASS** (live Genius: 32 lines), `npm run bridge:smoke` **PASS** (`windows-smtc`).
- **Human Review:** Confirmed the three root-cause fixes against live responses (Genius search shape + the ad-split multi-container page; LRCLIB search fallback; CORS via the bridge proxy), that the scrapers were fully removed with no dangling references, that the proxy is loopback-only and host-allow-listed (no secrets, no open proxy), and that the delivery is `dev`-only at 0.4.0 with **no tag or release**. Pending the user's manual live test of the packaged build.

## [2026-10-15] Implement the post-MVP UX redesign (spec 12)

- **Tool:** opencode (big-pickle)
- **Context:** Execute `specs/12_SPEC_POSTMVP-UX-REDESIGN.md` — live testers called the chrome "mostly useless stuff for our purposes". The redesign removes the search bar, playback controls/scrubber, curated "Amazon Music Trending" row, mock Home/Podcasts/Library nav, and the floating window; docks the lyrics into the former "Live Stream Playback Status" region; moves sync calibration + all customization together; renames "Genius" → **Info**; adds a local **Most Listened** view; re-baselines tests/coverage; and registers the pending deficiencies as GitHub issues. Scope is UI/UX + local usage tracking only — no retrieval/detection/bridge/AI changes.
- **Prompt:** "What did we do so far?" → "let's proceed" (approved plan, then "proceed with the items of the Next Move").
- **Result (code/tests):** `src/types/lyrics.ts` reworked (`AppSettings`, `LayoutPresetId`/`LayoutPreset`, `BackgroundTheme`, `FeedbackState`; `WindowState` pruned). New services: `settingsStore.ts` (`lyrics-amazon:settings:v1`), `playHistoryStore.ts` (`lyrics-amazon:play-history:v1`, one play per track-session after **≥ 30s** of real desktop playback, seek-guarded by `MAX_STEP_MS=2500`), `layoutPresets.ts` (`LAYOUT_PRESETS`/`layoutWidthFor`). New components: `NowPlayingHeader.tsx` (album art + title/artist/album + detection chip + Most Listened toggle + Options slot), `LyricsPanel.tsx` (docked surface: Karaoke/Full Sheet, sync calibration, thumbs, auto-scroll, Info drawer), `InfoPanel.tsx` (rename of `GeniusAnnotationsPanel`), `MostListenedPanel.tsx` (Hot/Month/Lifetime), `BackgroundBackdrop.tsx` (3 decorative themes). `OptionsMenu.tsx` expanded into the single customization surface (layout/backdrop/appearance/default sync/reset history; AI section removed); `KaraokeLyricsView.tsx` "Genius"→"Info"; `App.tsx` rewritten (docked 3-region layout, `positionMs`-anchored clock, desktop-gated `PlaySessionScorer`, settings/`historyVersion` persistence). Deleted `AmazonMusicBar`, `BackgroundDesktop`, `FloatingLyricsWindow`, `GeniusAnnotationsPanel`, `curatedTracks.ts` (+ their tests); `lyricsService.ts` dropped `searchTracks`/curated/`httpFetch`. Tests reorganized (185 Vitest, 20 files) with new `settingsStore`/`playHistoryStore`/`NowPlayingHeader`/`InfoPanel`/`MostListenedPanel`/`LyricsPanel` suites and extended provider-branch coverage; `scripts/coverage-report.ts` gained a **critical-file 100%** gate; `e2e/app.spec.ts` rewritten.
- **Result (gates):** lint, build, **185** Vitest, coverage **93.23%** combined (FE 95.78%, Rust 89.76%) with **all 8 critical files at 100%**, `cargo fmt --check`, `cargo clippy --all-targets`, **41** Rust tests, **10** Playwright E2E, `npm run smoke`, `npm run bridge:smoke`, and `npm run tauri:build -- --no-bundle` all green. Two fixes surfaced during gating: the E2E `egress` respawn panicked (Tauri/WebView2 "resource in use") so the bridge is now respawned with an isolated `WEBVIEW2_USER_DATA_FOLDER` + a 30s budget, and the long-known flaky Rust poller test deadline was widened from 2s → 10s (`src-tauri/src/bridge/source/mod.rs`).
- **Human Review:** Confirmed the four locked decisions (layout presets, 3 backdrops/no mock nav, issues drafted before filing, curated fully removed), the `dev`-only/no-version-bump delivery, and that no retrieval/detection/bridge/AI behavior changed (AI Options hidden; `resolveAIConfig` now stays inert since no key is collected). Docs updated: README, `PROJECT_OVERVIEW.MD`, spec-12 DoD.
- **Filed backlog issues (§3.6):** the carried-over + spec-12 deficiencies are registered as GitHub issues — [#1](https://github.com/Gilgamashed/lyrics-amazon/issues/1) AI key off the client · [#2](https://github.com/Gilgamashed/lyrics-amazon/issues/2) headless scraping · [#3](https://github.com/Gilgamashed/lyrics-amazon/issues/3) macOS/Linux adapter validation · [#4](https://github.com/Gilgamashed/lyrics-amazon/issues/4) updater signing-key lifecycle · [#5](https://github.com/Gilgamashed/lyrics-amazon/issues/5) MSI auto-update · [#6](https://github.com/Gilgamashed/lyrics-amazon/issues/6) code signing/notarization · [#7](https://github.com/Gilgamashed/lyrics-amazon/issues/7) telemetry · [#8](https://github.com/Gilgamashed/lyrics-amazon/issues/8) bridge auto-discovery + transport controls · [#9](https://github.com/Gilgamashed/lyrics-amazon/issues/9) rate-limit policy + cache TTL · [#10](https://github.com/Gilgamashed/lyrics-amazon/issues/10) additional sources + provider ordering · [#11](https://github.com/Gilgamashed/lyrics-amazon/issues/11) live artist/song/album info · [#12](https://github.com/Gilgamashed/lyrics-amazon/issues/12) AI fallback activation · [#13](https://github.com/Gilgamashed/lyrics-amazon/issues/13) Most Listened sync/analytics · [#14](https://github.com/Gilgamashed/lyrics-amazon/issues/14) advanced theming · [#15](https://github.com/Gilgamashed/lyrics-amazon/issues/15) packaged-app E2E + visual regression · [#16](https://github.com/Gilgamashed/lyrics-amazon/issues/16) parser fuzz + load testing.



