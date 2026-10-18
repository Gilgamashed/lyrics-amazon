# 15_SPEC_POSTMVP-RELEASE-HARDENING.md — Post-MVP: Release Hardening — Single Instance, Test Update Channel & Packaged-App E2E

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows `specs/14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Make the 0.5.x line **safe to distribute to testers as a new testing release**: a second launch of the app must **focus the running instance instead of silently starting detection-dead**, testers on a testing build must **auto-update to the next testing build** through a dedicated channel, and the **packaged artifact itself** must be E2E-verified **before its assets become public**. It delivers the version line at **`0.5.3`**, cut as the testing release **`v0.5.3-rc.1`** (version files carry `0.5.3-rc.1` while the rc line is active).

The work is strictly bounded to **app-instance/bridge-startup behavior**, the **updater channel configuration and release workflow**, and the **packaged-app E2E gate**. It does not touch detection payloads, the playback clock, lyrics loading, the provider chain, the karaoke pipeline, or the lyrics panel (all owned by `13_SPEC_POSTMVP-LIVE-CORE-PATCH.md` / `14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`).

## 2. Context

This is the **seventh post-MVP spec**, following `specs/14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`. Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

### 2.1 Pre-distribution review findings (source of this spec)

A review of the specs 13/14 output before cutting the next testing release found three release-readiness gaps:

- **A second app launch silently breaks native detection.** Nothing prevents two instances; the loser's bridge hits a busy port, logs an error nobody can see, and the window still looks healthy.
- **Testing releases cannot reach testers.** The updater reads only `releases/latest`, which GitHub excludes pre-releases from; a tester installing an rc never receives the next rc automatically. The update-install path itself has had no live exercise since `0.2.0 → 0.2.1` (spec 09).
- **The artifact testers install has never been tested.** Every automated test drives the debug binary behind `vite preview`; the NSIS build, its embedded WebView2, and its updater wiring are verified only manually.

The release-safe **diagnostics** gap (production builds discard `devLog` and the Tauri log plugin) was identified in the same review but is **explicitly deferred** to the next spec (§5).

### 2.2 Root-cause analysis (diagnosed against the code)

1. **No single-instance guard, and the failure is invisible.** `src-tauri/src/lib.rs:4-25` registers no single-instance plugin, so every launch runs full setup including `bridge::run()`. The bridge binds one fixed port (`src-tauri/src/bridge/mod.rs:24`, `PORT = 48765`, served via `localhost_bind_addr` at `mod.rs:74-76`) and on failure merely `log::error!`s and returns (`mod.rs:95-101`) — while release builds are `windows_subsystem = "windows"` (`src-tauri/src/main.rs:2`), so **no console exists to show it**. The app keeps running detection-dead; the UI's Browser fallback is indistinguishable from a genuine bridge loss.
2. **The channel excludes the releases it is meant to serve.** `plugins.updater.endpoints` points solely at `…/releases/latest/download/latest.json` (`src-tauri/tauri.conf.json:42-47`), and `release.yml:65` marks every `-`-tagged build as a GitHub **pre-release** — which `releases/latest` skips (the workflow's own release body at `release.yml:63` documents this). Worse, `latest.json` carries the **configured app version**, so even if the endpoint were reachable, two rc builds both at `0.5.3` would never trigger an update — rc→rc delivery requires prerelease-suffixed versions (`0.5.3-rc.1 < 0.5.3-rc.2` in semver).
3. **The shipped binary is outside every gate.** `playwright.config.ts:29-36` runs `vite preview` with `globalSetup` doing a **debug** `cargo build` (`e2e/global-setup.ts:64-76`); `release.yml` runs lint + unit tests, then lets `tauri-action` build **and immediately publish** (`releaseDraft: false`, `release.yml:64`). Nothing executes the built NSIS artifact, and backlog issue **#15** ("packaged-app E2E + visual regression") has stayed parked since `08_SPEC_HARDENING.md` §5.

### 2.3 Current status (implemented through spec 14)

- ✅ Release pipeline publishes installers + `latest.json` + `.sig` on `v*` tags; signing key lives only in CI secrets (spec 09).
- ✅ Pre-release tagging convention exists (`vX.Y.Z-rc.N` → GitHub pre-release; `staging` branch carries the release — `PROJECT_OVERVIEW.MD` §5).
- ✅ Debug E2E drives the real bridge binary with a scripted mock source (12 tests).
- ⬜ **No single-instance guard; busy-port failure is silent** in release builds (defect 1).
- ⬜ **No testing update channel**; the rc line is manual-re-download only and the updater path is stale-verified (defect 2).
- ⬜ **No packaged-app E2E**; publishing is not gated on the artifact working (defect 3; issue #15).

### 2.4 Key decisions (accepted for this spec)

- **Version line & tags:** bump **`0.5.2 → 0.5.3`** across the three version files, with the **rc line carrying the full prerelease suffix** in those files (`0.5.3-rc.1`, then `0.5.3-rc.2`, …); plain `0.5.3` is reserved for the eventual stable cut. Tags are cut from `staging` per the documented flow: **`v0.5.3-rc.1`** is the testing release distributed to testers.
- **Dual update channel:** rc builds are produced with a committed build-time config override (`src-tauri/tauri.rc.conf.json`) that changes **only** `plugins.updater.endpoints` to `…/releases/download/test-latest/latest.json` — a **rolling pre-release** whose `latest.json` asset the release workflow refreshes after every publish (rc **or** stable, so the channel converges to the newest release of either kind). Stable builds keep `releases/latest` untouched and can never see an rc. The signed artifact signature remains the trust anchor; the channel URL is public and secret-free.
- **Single-instance guard:** add `tauri-plugin-single-instance` (Rust-side only — **no capability changes**); a second launch focuses the existing window and exits before setup runs.
- **Busy-port visibility:** the bridge startup surfaces a bind failure to the shell via the **already-registered** `tauri-plugin-dialog` as a native message (port occupied → native detection unavailable), and the app **continues with browser fallback** — consistent with the graceful-degradation behavior specs 13/14 rely on. No retry/rebind loop this round.
- **Packaged-app E2E:** a new Windows-only suite driving the **release binary** through `tauri-driver` + `msedgedriver` (WebDriver, not Playwright — the webview is not CDP-attachable), written as a `tsx` script in the house style of the existing `smoke-*` scripts, with mock-driven detection for determinism. It runs **locally before every tag cut** and in the release workflow **between build and publish** — release-gating only, no per-push CI job (per user decision).
- **Publish gating:** `release.yml` switches to `releaseDraft: true` → packaged E2E against the just-built binary → on success `gh release edit <tag> --draft=false`; a failed gate leaves the release as an unpublished draft.
- **Live channel verification:** mirroring spec 09's live-verified `0.2.0 → 0.2.1`, the spec delivers **`v0.5.3-rc.1`** (distributed) and closes the channel DoD by **observing one real rc→rc in-app update** (`v0.5.3-rc.1 → v0.5.3-rc.2`, the second tag carrying the verification-pass fixes).
- **Delivery:** land on `dev`, merge to `staging`, tag/cut the rc releases; **no stable release, no `latest`-channel change, no CI-secret changes**.

**Out of scope for this spec:** everything owned by `13_SPEC_POSTMVP-LIVE-CORE-PATCH.md` and `14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md` (detection payload, clock, load sequencing, metadata edits, panel UX, provider chain, AI karaoke); release-safe **diagnostics logging** (deferred — §5); the stable **`0.5.3`** release; visual regression; macOS/Linux packaged validation; update-dialog UX changes; and any `latest`-channel or signing-key-lifecycle changes.

## 3. Tasks and Responsibilities

### 3.1 Single-Instance Guard & Busy-Port Visibility

| Task | Responsibility |
| :--- | :--- |
| Add `tauri-plugin-single-instance` to `src-tauri/Cargo.toml` and register it first in the Tauri builder (`src-tauri/src/lib.rs`); the second-instance callback focuses the existing `main` window and the new process exits before setup/bridge start. No capability changes. | Delivery |
| Thread the `AppHandle` into the bridge startup so a bind failure on `48765` raises a **native dialog** (existing `tauri-plugin-dialog`) stating that track detection could not start because the port is in use, then continue in browser-fallback mode (no retry loop). | Delivery & Quality |
| Extract the bind-failure startup path behind a testable seam and add Rust tests: a pre-occupied port yields the surfaced failure (not a silent return), and the serving path is unaffected. | Quality |
| Verify the debug E2E harness interplay: `global-setup`/`ensureBridge` kills the port owner **before** spawning, and a spawn that exits early (mutex held by a live instance) fails fast with a hint instead of a 30 s health timeout. | Quality |
| Keep the macOS/Ubuntu `platform-matrix` job green with the new plugin (extend the Linux system-deps step in `ci.yml` only if the plugin requires it). | Quality |

### 3.2 Testing Update Channel (rc auto-update)

| Task | Responsibility |
| :--- | :--- |
| Add `src-tauri/tauri.rc.conf.json` overriding **only** `plugins.updater.endpoints` to `…/releases/download/test-latest/latest.json`; leave the stable endpoint and all other config untouched. | Delivery |
| Extend `.github/workflows/release.yml` so `-`-tagged builds pass the override to `tauri build` (via `tauri-action` `args`) while stable builds keep the current config. | Delivery & Quality |
| Add a channel step that, after every successful publish (rc **or** stable), downloads that release's `latest.json` and uploads it to the rolling **`test-latest`** pre-release (`gh release create test-latest --prerelease` on first use, then `gh release upload … --clobber`) so the test channel always serves the newest published build. | Delivery & Quality |
| Verify live: `test-latest/latest.json` is publicly reachable and references the just-published rc's assets; an installed stable build still checks `releases/latest` only (never an rc). | Quality |
| Carry the rc versioning rule into the bump: version files hold `0.5.3-rc.N` for the rc line so `latest.json` versions ascend (`0.5.3-rc.1 < 0.5.3-rc.2`), enabling rc→rc delivery. | Delivery / Quality |

### 3.3 Packaged-App E2E (release gate)

| Task | Responsibility |
| :--- | :--- |
| Add `scripts/e2e-packaged.ts` (`tsx`, house style of `smoke-*`) launching the **release binary** from `src-tauri/target/release/` under `tauri-driver` + `msedgedriver`, with the needed WebDriver client as a devDependency; expose `npm run test:e2e:packaged`. | Delivery & Quality |
| Implement five checks: (1) the app launches and the main window renders; (2) the packaged process serves `/health` on `48765`; (3) with `BRIDGE_MOCK_SCRIPT` set, the UI shows the **Desktop (native)** badge and the mock track title; (4) a **second launch exits promptly while the first stays healthy** (single-instance, real-process proof); (5) startup reaches a usable state with the update check completing quietly (no blocking modal — see note). | Quality |
| Document driver setup and usage (tauri-driver install, msedgedriver matching the host/runner WebView2, run-before-tag) in the README and the script header. | Documentation |
| Windows-only; wire the suite into `release.yml` between build and publish, and keep it out of per-push `ci.yml` (release-gating only, per decision). | Delivery & Quality |

*Note (check 5):* during gating the test channel serves an **equal or older** version (or 404 on first use), so the updater stays quiet by design; the full prompt→download→install→relaunch flow is verified live in §3.5, not here.

### 3.4 Release Pipeline Gating

| Task | Responsibility |
| :--- | :--- |
| Switch `release.yml` to `releaseDraft: true`; after the packaged E2E step passes, publish with `gh release edit <tag> --draft=false` (pre-release flag for `-` tags preserved); on E2E failure the workflow fails and the assets stay unpublished. | Delivery & Quality |
| Keep the existing lint + unit-test steps, signing secrets, and `contents: write` scope unchanged; no new secrets or permissions. | Code Safety / Quality |

### 3.5 The v0.5.3-rc Cuts

| Task | Responsibility |
| :--- | :--- |
| Bump **`0.5.2 → 0.5.3-rc.1`** across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (`Cargo.lock` regenerates); land on `dev`, merge to `staging`, tag **`v0.5.3-rc.1`**, and verify the gated run publishes the pre-release with its `latest.json` refreshed into `test-latest`. | Delivery |
| Live-verify the installed `v0.5.3-rc.1`: SmartScreen bypass (existing docs), window renders, bridge healthy, mock/real detection, and the visible version annotation reads `0.5.3-rc.1`. | Quality |
| Cut **`v0.5.3-rc.2`** carrying any verification-pass fixes and **observe the installed rc.1 auto-update to rc.2 in-app** (prompt → download → install → relaunch), closing the channel DoD exactly as spec 09 did for `0.2.0 → 0.2.1`. | Delivery & Quality |
| Extend the README **Install for Testing** section with the testing channel: rc builds auto-update through the test channel, stable builds are unaffected, and reverting means installing the stable artifact. | Documentation |

### 3.6 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Keep every existing gate green: `npm run lint`, `npm run build`, `npm run test`, `npm run coverage:report` (≥ 85% combined), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run test:e2e`, `npm run smoke`, `npm run bridge:smoke` — plus `npm run test:e2e:packaged` as the **release gate** (run locally before each tag cut and in `release.yml`). | Quality |
| Keep coverage **≥ 85% global** and **100% of critical utilities** (critical set unchanged — this spec adds no frontend retrieval/sync modules; the new Rust seam is covered by `cargo test`). | Quality |
| Limit changes to the single-instance/busy-port path, the updater channel config + release workflow, and the packaged-E2E suite — no detection, clock, lyrics, provider, karaoke, or panel changes; no capability changes. | Quality |
| Introduce no secrets: the test-channel URL is public; the updater signing key stays a CI secret only; `.env*` stays ignored. | Code Safety (per `00_AI-SAFE.md`) |
| **Bump the version to `0.5.3-rc.1`** (rc line) across the three version files; do **not** cut a stable release and do **not** implement the §5 deferred items. | Delivery / Code Safety |
| Keep the README, `specs/PROJECT_OVERVIEW.MD` §5 release flow, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

## 4. Definition of Done

- [ ] A second launch of the app **focuses the existing window and exits** before starting a duplicate bridge (proven by the packaged-E2E real-process check).
- [ ] When `48765` is held by a foreign process, the user sees a **native dialog** explaining that detection cannot start, and the app **continues with browser fallback** — no more silent detection-dead state.
- [ ] The debug E2E harness still runs green with single-instance active (early-exit spawn fails fast with a clear hint).
- [ ] **rc builds read the test channel** (`test-latest`), stable builds read `releases/latest` only, and the config override changes nothing else.
- [ ] `…/releases/download/test-latest/latest.json` is publicly reachable, carries the newest published version, and points at that release's assets (refreshed after every publish, rc or stable).
- [ ] The **packaged-app E2E suite passes** (5 checks) locally and in `release.yml`; publishing happens **only after** it passes, and a failure leaves the release unpublished.
- [ ] **`v0.5.3-rc.1`** is published as a gated pre-release from `staging`; the installed build renders, serves `/health`, detects a track, and shows version `0.5.3-rc.1`.
- [ ] One **real rc→rc in-app update** is observed end-to-end (`v0.5.3-rc.1 → v0.5.3-rc.2`: prompt, download, install, relaunch).
- [ ] All existing quality gates pass (lint, build, Vitest, coverage ≥ 85% with the critical set unchanged at 100%, fmt, clippy, Rust tests, E2E, `smoke`, `bridge:smoke`), and the `platform-matrix` job stays green with the new plugin.
- [ ] No secrets are committed; the signing key stays in CI secrets; `specs/PROMPTS.md` records this spec; the README and `specs/PROJECT_OVERVIEW.MD` stay consistent.
- [ ] No stable release was cut, no `latest`-channel change was made, and no §5 deferred items were introduced.

## 5. Deferred / TODO

- **Release-safe diagnostics** (structured local logging usable in production builds — `devLog.ts` is `DEV`-gated and the Tauri log plugin is `debug_assertions`-only in `lib.rs`) — identified in the same review; **next spec candidate**.
- **Stable `0.5.3` release** — cut after the rc line converges; the version files drop the `-rc.N` suffix at that point.
- **Visual regression** — the other half of backlog issue #15; this spec delivers the packaged-E2E half only.
- **Packaged-app E2E on macOS/Linux** and msedgedriver pinning/caching hardening in CI — Windows-first; the suite is release-gated, not per-push.
- **Update-dialog UX** (progress, snooze, channel indicator) — the existing native prompt is unchanged.
- **Updater signing-key lifecycle** (rotation/recovery) — still deferred per `09_SPEC_POSTMVP-APP-PACK.md` §5 (issue #4).
- **Retry/rebind on a transient port conflict** — one-shot dialog only this round.
