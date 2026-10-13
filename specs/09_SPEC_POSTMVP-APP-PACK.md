# 09_SPEC_POSTMVP-APP-PACK.md — Post-MVP: App Packaging for Live Testing

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows the 8-phase MVP roadmap; see `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Prepare the app for **live testing** by turning the Windows MVP build into a distributable, self-updating, versioned release that external testers can download, install (bypassing the unsigned-installer warning), and keep up to date: produce the Windows installers from a tagged release, publish them on GitHub Releases, wire an in-app auto-update (Tauri updater), unify the app version, and document the tester install/update path.

## 2. Context

This is the **first post-MVP spec**. The 8-phase MVP roadmap in `specs/PROJECT_OVERVIEW.MD` (§5) is complete (Phase 8 close-out); work now continues on the post-MVP backlog identified in `specs/08_SPEC_HARDENING.md` §5. Development still follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (implemented through Phase 8 / MVP):**

- ✅ `npm run tauri:build` produces the Windows installers from `bundle.targets = "all"`: NSIS `Amazon Music Floating Lyrics_0.1.0_x64-setup.exe` (2.17 MiB) and MSI `Amazon Music Floating Lyrics_0.1.0_x64_en-US.msi` (3.23 MiB).
- ✅ The packaged app boots with the UI rendering and the embedded companion bridge healthy on `127.0.0.1:48765`.
- ✅ CI (`.github/workflows/ci.yml`) validates every push to `dev` / pull request: a Windows full-gate job (lint, build, 131 Vitest tests, ≥ 85% combined coverage gate, `cargo fmt --check`, `cargo clippy --all-targets`, 36 Rust tests, 8 Playwright E2E tests) and a macOS/Ubuntu `platform-matrix` job. It **does not** build or publish installers, and there is no tag/release trigger.
- ⬜ Installers are **unsigned**, produced **manually**, and **only 0.1.0** exists; there is no distribution channel and no updater.
- ⬜ The app version is **inconsistent**: `package.json` is `0.0.0` while `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` are `0.1.0`.
- ⬜ No Tauri updater plugin, no `createUpdaterArtifacts`, no `plugins.updater` config, and no matching capability are present.

**Inherited from the post-MVP backlog (`08_SPEC_HARDENING.md` §5):**

- **Auto-update** — deferred to the post-MVP backlog; this spec implements it.
- **Code signing / notarization** — still requires certificates/accounts not available; this spec stays **unsigned** and documents the tester bypass (see §5).
- **Cross-platform installers** (macOS/Linux) and **live macOS/Linux adapter validation** — remain deferred (this spec is Windows-only).

**Key decisions (accepted for this spec):**

- **Platforms:** **Windows only** — the existing NSIS/MSI targets are the tester distribution surface.
- **Signing:** **Unsigned** installers with a documented SmartScreen bypass for testers; no code-signing certificates this round.
- **Auto-update:** include the **Tauri updater**, which signs its own update artifacts with a `tauri signer generate` (minisign) keypair — independent of Windows Authenticode, so unsigned installers can still auto-update.
- **Updatable installer:** the Tauri Windows updater supports **NSIS** (not MSI); the **NSIS `.exe`** is the artifact of record for testers, with MSI kept as a secondary/manual install.
- **Distribution:** a **tag-triggered CI release** (`v*`) on `windows-latest` that builds and publishes installers + the update manifest to a **GitHub Release**.
- **Tester docs:** **minimal** — an install/update section in the README only.
- **AI key handling:** unchanged — testers enter their own key in-app (the key-security overhaul remains deferred per `05_SPEC_AIFALLBACK.md` §5).
- **Target version:** **`0.2.0`** (tag `v0.2.0`) — the first live-test build.

**Out of scope for this spec:** new product features; changes to detection, lyrics, AI, or UI behavior beyond the updater wiring; code signing/notarization; macOS/Linux installers; MSI auto-update; live macOS/Linux hardware validation; the AI API-key security overhaul; telemetry/crash reporting; store distribution (Microsoft Store).

## 3. Tasks and Responsibilities

### 3.1 Windows Packaging & Versioning

| Task | Responsibility |
| :--- | :--- |
| Establish a **single source of truth** for the app version and align `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` on **`0.2.0`** (or generate the Rust/config version from it). | Delivery & Quality |
| Keep `bundle.targets = "all"` (NSIS + MSI on Windows); confirm `npm run tauri:build` produces the `0.2.0` installers. | Delivery |
| Record installer output paths, the target version, and minimum system requirements (WebView2 runtime; Rust/MSVC only to build) in the README. | Documentation |

### 3.2 In-App Auto-Update (Tauri Updater)

| Task | Responsibility |
| :--- | :--- |
| Add `tauri-plugin-updater` to the Rust core and register it in the Tauri shell (`src-tauri/src/lib.rs`). | Delivery |
| Enable `bundle.createUpdaterArtifacts` and configure `plugins.updater` with the updater **public key** and the update endpoint (`https://github.com/Gilgamashed/lyrics-amazon/releases/latest/download/latest.json`). | Delivery |
| Initialize a launch-time update check: query the endpoint, download + install a newer signed build when available, and relaunch; degrade quietly (log only) when offline or unconfigured. | Delivery & Quality |
| Add the required capability permission (`updater:default`) and keep the check behavior-neutral for dev/test builds (no-op when no endpoint/key is configured). | Quality / Code Safety |
| Manage the updater **private key** + password exclusively as CI secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`); never commit or bundle them. | Code Safety |

### 3.3 Release Pipeline

| Task | Responsibility |
| :--- | :--- |
| Add `.github/workflows/release.yml` triggered on `v*` tags, running on `windows-latest`: install Node/Rust, `npm ci`, and `npm run tauri:build` with the updater signing key so it emits the NSIS installer, the `.sig` update artifacts, and `latest.json`. | Delivery |
| Publish a **GitHub Release** for the tag and upload the installers, update artifacts, and `latest.json` as release assets; generate release notes from commits. | Delivery & Documentation |
| Scope this workflow's permissions to `contents: write` (release only); keep it **secrets-free** apart from the updater signing key; leave the existing `ci.yml` validation workflow unchanged. | Quality / Code Safety |
| Verify the published `latest.json` is reachable at the configured endpoint and matches the released version/assets. | Quality |

### 3.4 Distribution & Tester Onboarding (Minimal)

| Task | Responsibility |
| :--- | :--- |
| Add a README **"Install for Testing"** section: where to download the Windows installer (GitHub Releases), install steps, the expected Windows SmartScreen warning and how to proceed (unsigned build), and that the app auto-updates thereafter. | Documentation |
| Note the NSIS-vs-MSI choice (NSIS is the updatable tester artifact) and the minimum requirements. | Documentation |

### 3.5 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Keep every existing gate green: `npm run lint`, `npm run build`, `npm run test`, `npm run coverage:report` (≥ 85%), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run test:e2e`, `npm run smoke`, `npm run bridge:smoke`. | Quality |
| Limit code changes to the version alignment and updater wiring — no changes to detection, lyrics, AI, window, or bridge behavior. | Quality |
| Introduce no secrets: only `.env.example` is tracked; `.env*` stays ignored; the updater signing key lives only in CI secrets. | Code Safety (per `00_AI-SAFE.md`) |
| Do not implement the deferred items in §5 (signing/notarization, macOS/Linux artifacts, AI key-security overhaul, telemetry, store distribution). | Code Safety |
| Keep `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, the README, and this spec consistent with the implemented state. | Documentation |

## 4. Definition of Done

- [x] The app version is unified at **`0.2.0`** across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
- [x] `npm run tauri:build` produces the **0.2.0** Windows installers (NSIS `.exe` + MSI) locally.
- [x] `tauri-plugin-updater` is registered; `bundle.createUpdaterArtifacts` and `plugins.updater` (public key + endpoint) are configured; the `updater:default` permission is granted.
- [ ] The app checks for updates on launch and installs + relaunches a newer signed build when one exists; it degrades quietly when offline/unconfigured. *(Implemented and compiled into the release build; the live install/relaunch path was not observed — see the status note below.)*
- [ ] The updater artifact signing keypair is used only via CI secrets (`TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD`); nothing secret is committed or bundled. *(Password-protected keypair generated; the public key is committed and the private key is kept out of the repo. The CI-secret wiring is deferred.)*
- [ ] Pushing a `v0.2.0` tag runs `.github/workflows/release.yml` on `windows-latest` and publishes a GitHub Release containing the NSIS installer, the update artifacts (`.sig`), and `latest.json`. *(Workflow added; publishing deferred.)*
- [ ] The published `latest.json` is reachable at the configured endpoint and matches the released version. *(Deferred.)*
- [ ] An update from an earlier build to a newer one is observed to download, install, and relaunch successfully. *(Deferred — the live update test was intentionally skipped.)*
- [x] The README documents downloading and installing the tester build (incl. the SmartScreen bypass) and the auto-update behavior.
- [x] All existing quality gates pass (lint, build, 131 Vitest, coverage ≥ 85%, fmt, clippy, 36 Rust, 8 E2E, smoke, bridge:smoke).
- [x] No deferred §5 items (signing/notarization, macOS/Linux installers, AI key-security overhaul, telemetry, store distribution) were introduced.
- [x] `specs/PROMPTS.md` records this spec; `specs/PROJECT_OVERVIEW.MD` notes the post-MVP continuation.

**Local implementation status (2026-10-13 — publishing not authorized):**

- Version unified at `0.2.0`; `tauri-plugin-updater` + `tauri-plugin-dialog` registered in `src-tauri/src/lib.rs`; `bundle.createUpdaterArtifacts = true` and `plugins.updater` (public key + `…/releases/latest/download/latest.json` endpoint, `windows.installMode = passive`) configured in `src-tauri/tauri.conf.json`; `updater:default` capability added.
- Launch-time updater check is release-only (no-op in dev/test): on a newer signed build it shows an **Update / Later** prompt, and on confirm downloads, installs, and relaunches; offline/unreachable/404 degrades quietly (logs only).
- Password-protected minisign keypair generated with `tauri signer generate`; the **public** key is committed in `tauri.conf.json`, the **private** key lives outside the repo at `%USERPROFILE%\.tauri\lyrics-amazon.key`.
- `.github/workflows/release.yml` added (`v*` tags, `windows-latest`, `tauri-apps/tauri-action@v1`, `updaterJsonPreferNsis: true`, `permissions: contents: write`) — dormant until a tag is pushed.
- README "Install for Testing" section added (download → install → SmartScreen bypass → auto-update; NSIS is the updater artifact of record).
- Signed `npm run tauri:build` produced `Amazon Music Floating Lyrics_0.2.0_x64-setup.exe` (3.22 MiB, NSIS) and `…_0.2.0_x64_en-US.msi` (4.67 MiB) plus both `.sig` updater artifacts. All gates green (frontend lint/build, 131 Vitest, combined coverage **90.61%** ≥ 85%, `cargo fmt`/`clippy`, 36 Rust tests, 8 E2E, `smoke`, `bridge:smoke`).

**Go-live runbook (deferred, requires explicit approval):**

1. Make the repository public (`gh repo edit Gilgamashed/lyrics-amazon --visibility public`) — required for the updater endpoint and tester downloads.
2. Set secrets: `gh secret set TAURI_SIGNING_PRIVATE_KEY` and `gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. `git tag v0.2.0 && git push origin v0.2.0` → watch `release.yml`; confirm the Release assets (NSIS + MSI + `.sig` + `latest.json`) and open `…/releases/latest/download/latest.json`.
4. (Optional) publish `v0.2.1` and observe an installed `0.2.0` prompt-update, to check DoD items 4/8.

## 5. Deferred / TODO

- **Code signing & notarization:** Windows Authenticode and Apple Developer notarization require certificates/accounts not available here; installers remain unsigned and testers use the documented bypass.
- **macOS / Linux installers:** `.dmg`/`.app` and `.deb`/`.rpm`/AppImage packaging are not produced in this spec (Windows-only).
- **MSI auto-update:** the Tauri Windows updater supports NSIS only; MSI installs update manually.
- **Live macOS/Linux adapter validation** (MediaRemote/MPRIS) on physical hardware — still deferred from Phase 8.
- **AI API-key security overhaul** (OS keychain / server-side proxy / encrypted storage) — still deferred per `05_SPEC_AIFALLBACK.md` §5.
- **Updater signing-key lifecycle:** rotation, storage hardening, and recovery policy for `TAURI_SIGNING_PRIVATE_KEY` beyond a CI secret.
- **Telemetry & crash reporting** for live testers, and **store distribution** (Microsoft Store) are out of scope.
