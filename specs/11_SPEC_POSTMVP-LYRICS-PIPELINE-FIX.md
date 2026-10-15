# 11_SPEC_POSTMVP-LYRICS-PIPELINE-FIX.md — Post-MVP: Critical Lyrics Pipeline Fix

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows `specs/10_SPEC_POSTMVP-MIN-PATCH.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Fix the **critical live-testing failure: lyrics are never found**. Live testers report that no lyrics resolve for any track; this spec diagnoses the root causes and delivers the fix so that a real track detected from Amazon Music returns **real lyrics** end-to-end through the production (packaged) path.

The work is strictly bounded to the lyrics retrieval pipeline: its **network egress**, the **Genius** source, the **LRCLIB** source, the three **HTML-scraper** sources, and the **tests that failed to catch the defect**. No product features are added.

## 2. Context

This is the **third post-MVP spec**, following `specs/10_SPEC_POSTMVP-MIN-PATCH.md` (multi-provider chain, genuine not-found, feedback controls). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

### 2.1 Root-cause analysis (diagnosed, live-verified)

The provider chain was introduced in spec 10 and reported green across every gate, yet **never returns lyrics in the packaged app**. Diagnosis against the live endpoints found **two independent, compounding defects** plus a systemic test blind spot:

1. **Genius parsing bug — the primary source is always empty.**
   `src/services/providers/genius.ts:60` reads:
   ```ts
   const hits = searchJson?.response?.hits || [];
   ```
   The real `https://genius.com/api/search/song` payload nests hits at **`response.sections[].hits[]`**:
   ```json
   {"meta":{"status":200},"response":{"sections":[{"type":"song","hits":[{"result":{...}}]}]}}
   ```
   `response.hits` is always `undefined`, so the loop never runs and `fetchGenius` returns `{ hasSync: false, provider: 'Genius' }` for **every** track. Genius — the chain's first and primary source — can never match.

2. **CORS dead-ends — the webview cannot fetch the providers.**
   Every provider calls the webview's native `fetch()` directly (e.g. `genius.ts:52`, `lrclib.ts:14`). The packaged Tauri app serves the UI from `http://tauri.localhost` and enforces CORS. There is **no** `@tauri-apps/plugin-http` dependency and `src-tauri/capabilities/default.json` grants only `core:default` and `updater:default`, so provider requests are subject to the webview's origin policy. Live response headers:
   - `genius.com/api/*` → `200` but **no `access-control-allow-origin`** → blocked.
   - `lrclib.net/api/*` → **`access-control-allow-origin: *`** (the only CORS-clean source).
   - `www.azlyrics.com` → **`302`** redirect; no CORS header.
   - `www.letras.mus.br` → **`403 Forbidden`**; no CORS header.
   - `www.musixmatch.com` → **`202 Accepted`** (bot/WAF challenge page, not lyrics); no usable content.

   Even after defect 1 is fixed, Genius and the three scrapers remain unreachable from the webview, leaving only LRCLIB.

3. **LRCLIB fragility — even the one reachable source usually misses.**
   `src/services/providers/lrclib.ts` uses the `/api/get` endpoint, which requires an **exact `duration`** match; when the detected duration is absent or approximate (`App.tsx:73` defaults desktop tracks to `180000` ms), the server returns `404` and there is **no `/api/search` fallback**. LRCLIB also rate-limits with `429 Too Many Requests` on burst usage.

4. **Systemic test blind spot — why the gates were green.**
   - `src/services/providers/fetch.test.ts:35` mocks the response as `{ response: { hits: [...] } }` — the **same wrong shape** as the buggy code — so the Genius parsing defect is *codified* by the test rather than caught.
   - All tests run in **jsdom** (`vitest.config.ts`) and `scripts/smoke-lyrics.ts` runs in **Node**; neither enforces CORS. There is no test that exercises the production webview network path, so the CORS defect is invisible to the suite.

### 2.2 Current status (implemented through spec 10)

- ✅ Ordered chain `Genius → LRCLIB → azlyrics → letras.mus.br → musixmatch` (`src/services/providers/chain.ts`) before the AI fallback, with per-provider timeout/error isolation and a genuine "Lyrics not found" state (`lyricsService.ts`).
- ✅ Plain-only results render as Full Sheet; synchronized results drive Karaoke.
- ✅ Per-song thumbs up/down persisted via `src/services/userLyricsStore.ts`.
- ⬜ **Genius can never match** (defect 1).
- ⬜ **Genius + the three scrapers are CORS-blocked from the webview** (defect 2).
- ⬜ **LRCLIB has no `/api/search` fallback and no 429 handling** (defect 3).
- ⬜ **No test exercises the real (CORS-enforcing) production egress path** (defect 4).

### 2.3 Key decisions (accepted for this spec)

> **Revision note (2026-10-15):** the egress and scraper decisions below were revised during execution. The original plan (the `@tauri-apps/plugin-http` plugin plus repairing the three scrapers) was replaced by a **Rust bridge `/fetch` proxy** and by **dropping the three scrapers**. This spec is delivered as **v0.4.0**.

- **Single CORS-free egress layer:** all provider network I/O goes through one module, `src/services/httpClient.ts`, exposing `httpFetch(url, init)`. It performs a **direct-first** request via the global `fetch`; if that fails (the production webview enforces CORS and the providers omit `access-control-allow-origin`), it **falls back to the local Rust bridge proxy** `GET /fetch?url=<encoded>` on `127.0.0.1:48765`. The bridge issues the request from Rust via **`reqwest`** (not subject to webview CORS) and returns the upstream body/`Content-Type`. The proxy is **host-allowlisted** to the lyrics sources (Genius, LRCLIB) and loopback only. In Node (smoke) and where the upstream sends `access-control-allow-origin: *` (LRCLIB), the direct path succeeds.
- **Genius:** fix the response shape to `response.sections[].hits[]` (flatten every section), keep the existing best-match heuristic, and fetch the song page through the egress layer. The extractor joins all `data-lyrics-container="true"` blocks in DOM order (balanced-`div` scan, not a non-greedy regex), strips the leading "Contributors/Translations" widget prefix, and decodes HTML entities.
- **LRCLIB:** attempt `/api/get` first; on miss (`404`/no match) fall back to `/api/search` matched by normalized title + artist with a **±3s duration tolerance**, preferring synchronized results. Handle `429` with a bounded backoff retry.
- **Scrapers (revised decision):** **azlyrics, letras.mus.br, and musixmatch are dropped.** They are bot-blocked/challenged, carry legal/robustness risk, and are unnecessary. Their provider modules and tests are **deleted**, and the chain is reduced to **Genius → LRCLIB** (then the AI fallback when configured).
- **Tests must reproduce reality:** replace the incorrect mocked Genius shape (`response.hits`) with the **real** `response.sections[].hits[]` shape and multi-container page fixtures, and add a **browser-context** test that reproduces the production condition — an upstream that **omits `access-control-allow-origin`** — and asserts the app's egress path still resolves the body through the bridge proxy (closing the systemic blind spot).
- **Delivery:** **bump the app version to `0.4.0`** (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`) and commit the fix plus the new specs to `dev`. **No tag, no release, no CI-secret changes** (per the live-testing cadence).

**Out of scope for this spec:** any UI/layout change (owned by `12_SPEC_POSTMVP-UX-REDESIGN.md`); new lyrics providers beyond the existing five; changing the karaoke/full-sheet rendering contracts, detection, or the bridge; the AI API-key security overhaul; new releases/version bumps.

## 3. Tasks and Responsibilities

### 3.1 CORS-Free Egress Layer

| Task | Responsibility |
| :--- | :--- |
| Add a **`GET /fetch?url=` proxy** to the Rust bridge (`src-tauri/src/bridge/mod.rs`) that issues the request via `reqwest` (rustls-tls) and returns the upstream body + `Content-Type`, with a **host allow-list** (Genius, LRCLIB, loopback) and an invalid-scheme rejection. | Delivery |
| Introduce `src/services/httpClient.ts` exposing `httpFetch(url, init)`: **direct-first** with the global `fetch`, falling back to the bridge `/fetch` proxy on failure. Provider modules must not call `fetch` directly. | Delivery & Quality |
| The bridge is loopback-only (`127.0.0.1:48765`) and reached by the webview through the existing bridge CORS policy; the proxy forwards only allow-listed hosts. | Code Safety |
| Keep the egress layer behavior-neutral: same timeout/abort semantics as today, no secrets, no bundled credentials, no retry after the caller aborts. | Quality / Code Safety |

### 3.2 Genius Source Fix

| Task | Responsibility |
| :--- | :--- |
| Fix `fetchGenius` to read hits from **`response.sections[].hits[]`**, flattening all sections, instead of `response.hits`. | Delivery |
| Preserve the best-match heuristic (normalized title/artist) across the flattened hits and fetch the selected song page through the egress layer. | Delivery |
| Correct `src/services/providers/fetch.test.ts` to the **real** Genius payload shape and add a regression test asserting a non-empty match for a known song. | Quality |

### 3.3 LRCLIB Robustness

| Task | Responsibility |
| :--- | :--- |
| Keep `/api/get` as the fast path; on `404`/no-match, fall back to `/api/search` matched by normalized title + artist with a **±3s duration tolerance**. | Delivery |
| Handle `429`: back off, honor `Retry-After` when present, and reuse the existing lyrics cache rather than hammering the endpoint. | Delivery & Quality |
| Add tests covering the `/api/get` → `/api/search` fallback, duration tolerance, and the rate-limit path. | Quality |

### 3.4 HTML Scrapers — DROPPED

| Task | Responsibility |
| :--- | :--- |
| **Remove** the `azlyrics`, `letras.mus.br`, and `musixmatch` providers (`src/services/providers/{azlyrics,letras,musixmatch}.ts`) and their tests. | Delivery |
| Update the chain to **`Genius → LRCLIB`** (`chain.ts`), the provider union (`types/lyrics.ts`), and the UI provider order (`App.tsx`) to match. | Delivery |
| Rationale: the sources are bot-blocked/challenged (302/403/202), carry legal/robustness risk, and are unnecessary once Genius + LRCLIB are reachable through the egress layer. | Quality |

### 3.5 Verification & Test-Suite Integrity

| Task | Responsibility |
| :--- | :--- |
| Replace mocked provider payloads with **fixtures captured from the real endpoints** (Genius search JSON, Genius song HTML, LRCLIB get/search JSON, and one page per scraper) so tests validate reality, not an assumption. | Quality |
| Add a **browser-context** test that reproduces the production condition — a provider upstream that **omits `access-control-allow-origin`** — and asserts the app's egress path still resolves lyrics (closing the systemic blind spot). | Quality |
| Extend `scripts/smoke-lyrics.ts` (or add a dedicated script) to assert a **known live track** resolves through the full production path, and fail loudly when it does not. | Quality |

### 3.6 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Keep every existing gate green: `npm run lint`, `npm run build`, `npm run test`, `npm run coverage:report` (≥ 85% combined), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run test:e2e`, `npm run smoke`, `npm run bridge:smoke`. | Quality |
| Limit changes to the lyrics pipeline (egress, Genius, LRCLIB, tests) — no UI redesign, detection, window, or bridge-transport changes (the bridge gains only the `/fetch` proxy). | Quality |
| Introduce no secrets: provider keys (if ever configured) come from env/CI only; `.env*` stays ignored; the proxy allow-list contains only public lyrics hosts and loopback. | Code Safety (per `00_AI-SAFE.md`) |
| **Bump the app version to `0.4.0`** across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` (root package only; `Cargo.lock` regenerates); do **not** tag or publish; do **not** implement the §5 deferred items. | Delivery / Code Safety |
| Keep the README (provider-egress note), `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

## 4. Definition of Done

- [ ] A **live track detected from Amazon Music resolves real lyrics end-to-end through the packaged app's production path** (not just in Node/jsdom).
- [ ] All provider network I/O flows through **one CORS-free egress layer** (`httpClient.ts`); no provider calls `fetch` directly.
- [ ] The Rust bridge exposes a **host-allowlisted `GET /fetch?url=` proxy** (`reqwest`) that the egress layer falls back to when the webview's direct fetch is CORS-blocked.
- [ ] **Genius** reads `response.sections[].hits[]` and matches a known song; the incorrect mocked shape is removed from the tests.
- [ ] **LRCLIB** falls back to `/api/search` with duration tolerance and handles `429`; both paths are covered by tests.
- [ ] The **azlyrics, letras.mus.br, and musixmatch** providers are **removed**, and the chain is `Genius → LRCLIB`.
- [ ] Tests use the **real Genius payload shape** and multi-container page fixtures, and a **browser-context test** proves the egress path succeeds against a provider that omits CORS headers.
- [ ] The live smoke check asserts a known track resolves and fails when it does not.
- [ ] All existing quality gates pass (lint, build, Vitest, coverage ≥ 85%, fmt, clippy, Rust tests, E2E, `smoke`, `bridge:smoke`), with new tests covering the added behavior.
- [ ] No fabricated lyrics are introduced; the genuine "Lyrics not found" state still appears only when the whole chain yields nothing.
- [ ] No secrets are committed; `specs/PROMPTS.md` records this spec; the README and `specs/PROJECT_OVERVIEW.MD` stay consistent.
- [ ] The app version is bumped to **`0.4.0`**; **no tag or release** was produced and no §5 deferred items were introduced.

## 5. Deferred / TODO

- **Additional lyrics sources** beyond the existing five, and user-configurable provider ordering — out of scope here.
- **Headless-browser scraping** for sources that require JavaScript/WAF solving (letras.mus.br 403 / musixmatch 202) if header/URL fixes prove insufficient — deferred; scrapers remain best-effort.
- **Provider rate-limit policy & caching tuning** (polite backoff, per-provider cache TTLs) beyond the `429` handling required here.
- **AI API-key security overhaul** (OS keychain / server-side proxy / encrypted storage) — still deferred per `05_SPEC_AIFALLBACK.md` §5.
- **Live macOS/Linux egress validation** on physical hardware — CI runners are headless; the egress abstraction is platform-neutral.
