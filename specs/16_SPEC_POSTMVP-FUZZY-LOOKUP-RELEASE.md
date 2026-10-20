# 16_SPEC_POSTMVP-FUZZY-LOOKUP-RELEASE.md — Post-MVP: Lookup Fidelity, Local-First Lyrics & Window Memory — the 0.5.4 Release

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows `specs/15_SPEC_POSTMVP-RELEASE-HARDENING.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Close the **third round of live-testing feedback** (`specs/Feedback03.md`): make lyric lookups survive real-world song titles through a **normalization pipeline plus fuzzy matching**, make a **manual title/artist fix stick to the song being played** across every playback path, guarantee **saved and cached lyrics load before any online query** (including across restarts), and make the OS window **remember its position and size**. It delivers the version line at **`0.5.4`**, cut as a **stable release `v0.5.4` from `staging`** — the first stable release since `0.2.1`, which moves `releases/latest` to `0.5.4`.

The work is strictly bounded to the **lookup text pipeline (query building + candidate selection)**, the **local lyrics stores and their load order**, the **metadata-override linkage**, and **main-window geometry persistence**. It does not touch detection payloads, the playback clock, latest-wins load sequencing, the provider chain order, the karaoke pipeline, or the lyrics panel UX (owned by `13_SPEC_POSTMVP-LIVE-CORE-PATCH.md` / `14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`), nor the release-channel/packaged-E2E infrastructure (owned by `15_SPEC_POSTMVP-RELEASE-HARDENING.md`).

## 2. Context

This is the **eighth post-MVP spec**, following `specs/15_SPEC_POSTMVP-RELEASE-HARDENING.md`. Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

### 2.1 Round-3 live-tester feedback (verbatim intent)

Testers ran the installed rc line (`v0.5.3-rc.3`) and returned `specs/Feedback03.md`. All four items are **owned by this spec**:

- **String Normalization & Fuzzy Matching — the blind spot:** exact string matching fails constantly because song titles include metadata like `(Remastered 2011)`, `[Explicit] feat. Artist X`, or punctuation differences. **The fix:** build a robust normalization pipeline before querying APIs (stripping parentheses, lowercasing, removing featuring credits, handling special characters) alongside fuzzy string matching (Python's `thefuzz` or a JavaScript equivalent).
- **If the user manually fixes a particular song's name or artist, link it to the song currently being played for future reference.**
- **Make sure saved and cached lyrics are loaded before checking for online sources.**
- **Window geometry — position and size should be stored and remembered.**

### 2.2 Root-cause analysis (diagnosed against the code)

1. **Nothing normalizes the query, and nothing scores the answer.** Raw `song.title`/`song.artist` go on the wire verbatim: LRCLIB `/api/get` and `/api/search` (`src/services/providers/lrclib.ts:90-92,104-106`), Lyrica (`src/services/providers/lyrica.ts:101-103`), Genius search (`src/services/providers/genius.ts:138`), and the AI prompt (`src/services/aiService.ts:60`). The only normalizer, `normalize()` (`src/services/providers/base.ts:3-15`), runs **after** the network call, and it only lowercases, folds a few Latin-1 accents and collapses punctuation **while keeping the noise content**: `"Song (Remastered 2011)"` → `"song remastered 2011"` ≠ `"song"`. It is used in just two post-fetch filters (`lrclib.ts:71-75`, `genius.ts:152-161`). Candidate selection is exact-equality or "take the first": LRCLIB's `pickBest` prioritizes a ±3 s duration match **over title/artist identity** and otherwise falls through to "first result with synced lyrics, else `tracks[0]`" (`lrclib.ts:63-79`); Genius defaults to **`hits[0]`** regardless of match quality (`genius.ts:154-167`); Lyrica **never compares** its response title/artist against the request (`lyrica.ts:51-91,109-111`); `runProviderChain` performs zero identity filtering (`src/services/providers/chain.ts:45-92`). No fuzzy/similarity library exists anywhere (`package.json` has none; a repo-wide grep for `levenshtein|fuse|fuzzy|similarity` finds only the feedback text itself).
2. **The manual fix exists but its link is brittle and desktop-only.** `metaOverrideStore` keys entries by the **raw** detected strings `` `${title.trim().toLowerCase()}|${artist.trim().toLowerCase()}` `` (`src/services/metaOverrideStore.ts:28-30`), so a slightly different SMTC reading of the same song (`… (Remastered 2011)` vs the plain title) produces a **different key** and the stored fix never links. Overrides are also consulted **only** in the desktop-bridge handler (`src/App.tsx:408-414`); the browser Media Session path and the Most Listened re-selection `handleSelectSong` (`src/App.tsx:331-344`) never call `getOverride`.
3. **Local-first is order-fragile and keys drift.** `fetchLyrics` checks the in-memory cache **first** (`src/services/lyricsService.ts:31-34`), then accepted (`:58-59`), then saved AI (`:62-63`), then the chain — so a stale session-cache entry can shadow freshly generated karaoke (the AI-karaoke save writes `saveAILyrics` but never the cache, `src/App.tsx:294-300`). All local stores key on `trim().toLowerCase()` only (`lyricsCache.ts:13-15`, `userLyricsStore.ts:16`, `aiLyricsStore.ts:16`, `metaOverrideStore.ts:29`), so any decorated-variant reading misses locally and **hits the network despite a local result**. The cache is a memory-only `Map` (`lyricsCache.ts:11`), so a restart re-queries the chain (README "Local Data & Storage" documents this).
4. **Window geometry is never persisted.** The single main window is declared statically at 800×600 with no `x`/`y` (`src-tauri/tauri.conf.json:13-21`); no window-state plugin is registered (`src-tauri/Cargo.toml:20-33`), the only window call in Rust is `set_focus()` in the single-instance callback (`src-tauri/src/lib.rs:11-13`), no frontend code touches `@tauri-apps/api/window`, and the capabilities grant none (`src-tauri/capabilities/default.json:8-11`). `README.md:156` states position and size are not remembered — true today. (What *is* persisted is only the in-content panel width preset, `settings.layoutPreset` — unrelated to the OS window.)

### 2.3 Current status (implemented through spec 15)

- ✅ Local-first stages exist in principle: accepted (thumbs-up) and saved AI short-circuit before the provider chain, and live AI runs only after it (`lyricsService.ts:50-84`).
- ✅ A per-track manual metadata fix exists (edit dialog + `metaOverrideStore`, persisted, applied on later plays of the same detected key — spec 13).
- ✅ Gated release pipeline: draft → packaged-app E2E → publish, dual update channel, `test-latest` refresh after every publish (spec 15).
- ⬜ **No query normalization and no fuzzy/scoring layer**; decorated titles miss every exact-match stage and first-hit fallbacks can return the **wrong song** (defect 1).
- ⬜ **Override linkage breaks on metadata variants** and does not apply on the browser / Most Listened paths (defect 2).
- ⬜ **Local-first is not deterministic**: cache-before-saved shadowing, no write-through, key drift forces online queries, cache dies on restart (defect 3).
- ⬜ **Window position and size are not remembered** (defect 4).
- ⬜ **No `0.5.4` release** — the line is at `0.5.3-rc.3`; `releases/latest` still serves `0.2.1`.

### 2.4 Key decisions (accepted for this spec)

- **Normalization pipeline before every query and every local key.** A new pure module derives the *lookup identity* from the raw strings: lowercase → extend the accent fold → **pattern-gated removal of release noise** (bracketed segments matching remaster/deluxe/version/live/year/explicit/single/master-edition patterns, `feat.`/`ft.` credits both bracketed and trailing, and standalone noise tokens) → punctuation collapse. Stripping is **pattern-gated, not blanket**, so legitimate parenthetical titles (*"(Everything I Do) I Do It for You"*) survive intact. **Display titles stay raw** — normalization affects only queries, store keys and comparisons.
- **Fuzzy matching via `fastest-levenshtein`** (the accepted JavaScript equivalent of `thefuzz`'s distance primitive; tiny, zero-dependency): a small in-house `similarity()` combines normalized Levenshtein similarity with token-set containment. One new runtime dependency, justified and pinned in `package.json`.
- **Identity gate on every provider result.** A candidate whose score against the lookup identity is below the documented `MIN_IDENTITY_SCORE` constant (initially `0.80`, boundary-tested) is **rejected**; a provider with no passing candidate counts as a miss and the chain degrades to the next source — ending in the genuine *"Lyrics not found"* state rather than wrong-song lyrics. When the artist is the `Unknown Artist` placeholder, the gate scores the **title alone**. LRCLIB's ±3 s duration preference is retained but applies only **among identity-passing candidates**; the `/api/get` fast path validates its response identity the same way. The AI prompt receives normalized text.
- **Canonical local-first order: accepted → saved AI → cache → chain → live AI.** Durable user decisions (thumbs-up, saved karaoke) outrank the session cache inside a single request; **every save writes through to the cache** so a later lookup in the same session cannot return the pre-save result.
- **The cache becomes durable.** The bounded 20-entry / 7-day-TTL cache mirrors into a versioned `localStorage` key (`lyrics-amazon:lyrics-cache:v1`, quota- and disabled-storage-safe like the other stores) and hydrates at startup, so cached lyrics load before any online query **even across restarts**. The memory `Map` remains the hot path.
- **Normalized identity keys with dual-read fallback.** `lyricsCache`, `userLyricsStore`, `aiLyricsStore` and `metaOverrideStore` derive their keys from the normalized identity: reads try the normalized key first and **fall back to the legacy raw key** (existing testers' saved lyrics and overrides keep hitting), writes go to the normalized key, and a lazy one-shot rewrite migrates legacy entries. **Play history keys stay untouched** (protects Most Listened accounting — deferred to §5).
- **Override linkage hardened, not reworked.** Overrides are keyed by the **normalized detected identity** (legacy-key fallback included) so a fix links to the song across metadata variants and applies to future plays; `getOverride` is consulted on **all** playback paths (desktop bridge, browser Media Session, Most Listened re-selection). The edit dialog UI and apply/revert flow delivered by spec 13 are unchanged.
- **Window geometry via `tauri-plugin-window-state`** (Rust-side: remembers `SIZE | POSITION`, writes its state file under the app config dir, restores on launch; no capability changes expected — verified during implementation). First run falls back to the configured 800×600 default; restore is guarded against off-screen positions (a window restored outside every monitor is re-centered).
- **Delivery — stable `v0.5.4` from `staging`, direct cut (no new rc).** Bump **`0.5.3-rc.3 → 0.5.4`** across the three version files (the `-rc.N` suffix is dropped), land on `dev`, merge `dev → staging`, tag **`v0.5.4`** from `staging`. The existing gated workflow builds the **stable** config (`tauri.conf.json` — `releases/latest` endpoint, NSIS + MSI, `prerelease: false`), runs the packaged-app E2E gate between build and publish, then publishes and refreshes `test-latest`. Verification: `releases/latest` resolves to `v0.5.4` (the stable jump `0.2.1 → 0.5.4` in one update — the stable install/update path was live-proven in `09_SPEC_POSTMVP-APP-PACK.md`, `0.2.0 → 0.2.1`), and the **installed `v0.5.3-rc.3` is observed auto-updating to `0.5.4` in-app** through the test channel (semver `0.5.4 > 0.5.3-rc.3`), converging the rc line onto the stable release. No rc tags, no CI-secret changes, no workflow restructuring (the spec 15 gate is reused as-is).

**Out of scope for this spec:** everything owned by `13_SPEC_POSTMVP-LIVE-CORE-PATCH.md` (detection payload, playback clock, **latest-wins request sequencing**, metadata sanitization) except the declared override-linkage extension; everything owned by `14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md` (provider chain order `LRCLIB → Lyrica → Genius`, panel UX/scroll/follow, AI karaoke pipeline internals); everything owned by `15_SPEC_POSTMVP-RELEASE-HARDENING.md` (channel config, packaged-E2E suite internals, workflow structure — this spec only cuts a stable release through it); play-history identity; release-safe **diagnostics logging** (still deferred — §5); visual regression; macOS/Linux packaged validation; word-level karaoke; and any change to the AI key handling or CI secrets.

## 3. Tasks and Responsibilities

### 3.1 Normalization Pipeline & Fuzzy Identity Gate

| Task | Responsibility |
| :--- | :--- |
| Add `src/services/textNormalize.ts` — pure lookup-identity derivation: lowercase + extended accent fold, **pattern-gated** stripping of bracketed release noise and `feat.`/`ft.` credits, standalone noise-token removal, punctuation collapse. Display text is never modified. | Delivery |
| Add `fastest-levenshtein` to `package.json` and a pure `src/services/matchScore.ts` — `similarity(a, b)` (normalized edit distance + token-set containment) and the documented `MIN_IDENTITY_SCORE` (initially `0.80`) with title-only fallback when the artist is `Unknown Artist`. | Delivery |
| Build every provider query from the normalized identity: LRCLIB `/api/get` + `/api/search`, Lyrica, Genius search, and the AI prompt (`lyricsService`/`providers/*`/`aiService`). | Delivery |
| Gate every provider result: rework LRCLIB `pickBest` (duration rule only **within** identity-passing candidates), Genius hit selection (drop the `hits[0]` fallback in favor of best-score/none), and Lyrica response validation (compare returned title/artist for the first time); `/api/get` responses validated too. Rejected-everything = provider miss → chain continues. | Delivery & Quality |
| Extend the bridge `/fetch` allow-list only if a new host appears (expected: **none** — no new providers). | Code Safety |
| Tests: normalization fixtures straight from the feedback (`(Remastered 2011)`, `[Explicit]`, `feat. Artist X`, punctuation variants, a legit parenthetical title that must survive), score boundary cases at `MIN_IDENTITY_SCORE`, and chain regressions proving a decorated query resolves while a wrong-identity candidate is rejected to not-found. | Quality |

### 3.2 Local-First Loading & Durable Cache

| Task | Responsibility |
| :--- | :--- |
| Reorder `fetchLyrics` to the canonical **accepted → saved AI → cache → chain → live AI** order (durable user data before the session cache inside one request). | Delivery |
| Write every `saveAcceptedLyrics` / `saveAILyrics` result **through to the cache**, invalidating the shadowing entry. | Delivery & Quality |
| Persist the cache: hydrate the bounded 20-entry/7-day structure from a new `localStorage` key (`lyrics-amazon:lyrics-cache:v1`) at startup and mirror writes, quota- and disabled-storage-safe. | Delivery |
| Switch `lyricsCache`, `userLyricsStore`, `aiLyricsStore` and `metaOverrideStore` keys to the **normalized identity** with **dual-read legacy fallback** (reads: normalized → legacy; writes: normalized) plus a lazy one-shot legacy migration. Play history untouched. | Delivery & Quality |
| Tests: store-key dual-read/migration, cache hydration across a simulated restart, save write-through (fresh karaoke beats a stale cached plain result), and a **no-network regression** asserting the chain/AI stages are never entered when a local result exists. | Quality |

### 3.3 Manual-Fix Linkage (all playback paths)

| Task | Responsibility |
| :--- | :--- |
| Key `metaOverrideStore` by the normalized detected identity with legacy-key fallback, so a stored fix links to the same song despite metadata variants. | Delivery |
| Consult `getOverride` on **every** playback path — desktop bridge (existing), browser Media Session, and Most Listened `handleSelectSong` — before building the `Song` and loading lyrics. | Delivery & Quality |
| Keep the spec-13 edit dialog, apply/revert flow and Revert indicator as delivered (no UI redesign); verify the fix **persists across restarts** and **applies to future plays** of the linked song. | Quality |
| Tests: a fix recorded under a decorated reading applies to the clean reading (and vice-versa), each playback path honors overrides, revert still restores the raw detection. | Quality |

### 3.4 Window Geometry Persistence

| Task | Responsibility |
| :--- | :--- |
| Add `tauri-plugin-window-state` to `src-tauri/Cargo.toml` and register it in `src-tauri/src/lib.rs` (after the single-instance plugin), remembering `SIZE | POSITION` only (maximized/fullscreen state out of scope). No capability changes expected — verify against `capabilities/default.json`. | Delivery |
| Guard the restore: a window whose saved position falls outside every attached monitor is re-centered at the configured default size (first run keeps the 800×600 default). | Delivery & Quality |
| Live-verify: move/resize → quit → relaunch restores geometry; document the state file location alongside the existing "Local Data & Storage" paths and flip the `README.md:156` claim. | Documentation |
| Extend the packaged-app E2E check list only if the plugin can be driven deterministically there; otherwise record the live verification in the DoD (no flaky CI geometry assertions). | Quality |

### 3.5 The v0.5.4 Cut (stable release from `staging`)

| Task | Responsibility |
| :--- | :--- |
| Bump **`0.5.3-rc.3 → 0.5.4`** across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (`Cargo.lock` regenerates); drop the `-rc.N` suffix everywhere it appears in docs (README, `PROJECT_OVERVIEW.MD`). | Delivery |
| Run every gate locally (§3.6), land on `dev`, merge **`dev → staging`**, tag **`v0.5.4`** from `staging`. | Delivery & Quality |
| Verify the gated release run: stable config built (NSIS + MSI + `.sig` + `latest.json`), packaged-app E2E passes, draft flips to published **only after** the gate, `prerelease: false`. | Quality |
| Live-verify distribution: `releases/latest` resolves to `v0.5.4` with `version: 0.5.4` in its `latest.json`; the installed **`v0.5.3-rc.3` auto-updates to `0.5.4` in-app** via the refreshed `test-latest` channel (prompt → download → install → relaunch), and the installed build shows `v0.5.4`. | Delivery & Quality |
| Update the README (Install for Testing/Storage/release flow), `specs/PROJECT_OVERVIEW.MD` §5 candidate line, and `specs/PROMPTS.md`. | Documentation |

### 3.6 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Keep every existing gate green: `npm run lint`, `npm run build`, `npm run test`, `npm run coverage:report` (≥ 85% combined), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run test:e2e`, `npm run smoke`, `npm run bridge:smoke`, plus `npm run test:e2e:packaged` as the release gate. | Quality |
| Keep coverage **≥ 85% global** and **100% of critical utilities**, extending the critical set with `textNormalize.ts`, `matchScore.ts`, the persisted-cache hydration and the dual-read store keys. | Quality |
| Limit changes to the lookup text pipeline, the local stores/load order, override linkage, window geometry, and the version bump — no detection payload, clock, latest-wins sequencing, chain order, karaoke-pipeline, panel-UX, capability or workflow-structure changes. | Quality |
| Introduce exactly **one** runtime dependency (`fastest-levenshtein`, no transitive deps), justified in this spec; no secrets; `.env*` stays ignored; the window-state file stays local to the app config dir. | Code Safety (per `00_AI-SAFE.md`) |
| **Bump the version to `0.5.4`** across the three version files and cut the stable `v0.5.4` release from `staging`; do **not** implement the §5 deferred items. | Delivery / Code Safety |
| Keep the README, `specs/PROJECT_OVERVIEW.MD` §5, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

## 4. Definition of Done

- [x] A decorated title/artist (`Song (Remastered 2011)`, `Song [Explicit]`, `Song feat. Artist X`, punctuation/case variants) resolves lyrics through the normalized query path, and the same decorated/clean readings map to **one local identity** (cache, accepted, saved AI, overrides).
- [x] Every provider result passes the identity gate; a wrong-identity candidate is **rejected** instead of played, the chain degrades to the next source, and an all-miss lookup ends in the genuine *"Lyrics not found"* state. The `MIN_IDENTITY_SCORE` boundary is covered by tests.
- [x] The normalized pipeline and `fastest-levenshtein` are the **only** additions to the text-matching surface; queries are built from normalized text across LRCLIB, Lyrica, Genius and the AI prompt.
- [x] The canonical **accepted → saved AI → cache → chain → live AI** order holds, saves write through to the cache, and a regression test proves **no online source is queried when a local result exists**.
- [x] Cached lyrics are **persisted and hydrated at startup** — after a restart, a previously seen track loads from cache without touching the network; legacy raw-key entries written by earlier versions still hit (dual-read), then migrate on write.
- [x] A manually fixed title/artist **links to the song being played across metadata variants**, applies on **all** playback paths (desktop, browser, Most Listened), survives restarts, and still reverts to the raw detection.
- [x] The main window **remembers position and size**: move/resize → quit → relaunch restores geometry; first run keeps the 800×600 default and an off-screen restore re-centers. No capability changes were needed (or they are documented here).
- [x] **`0.5.4`** is bumped across all three version files, tagged as **`v0.5.4` from `staging`**, and published **only after** the packaged-app E2E gate passes (`prerelease: false`, NSIS + MSI + `latest.json`).
- [x] `releases/latest` resolves to **`v0.5.4`** (stable jump `0.2.1 → 0.5.4` recorded), `test-latest` was refreshed by the publish, and an installed **`v0.5.3-rc.3` was observed auto-updating to `0.5.4` in-app**.
- [x] All existing quality gates pass (lint, build, Vitest, coverage ≥ 85% with the extended critical set at 100%, fmt, clippy, Rust tests, E2E, `smoke`, `bridge:smoke`, packaged E2E gate), with new tests covering normalization, scoring, store keys, load order and override linkage.
- [x] Exactly one new runtime dependency (`fastest-levenshtein`) is committed; **no secrets** are committed; `specs/PROMPTS.md` records this spec; the README and `specs/PROJECT_OVERVIEW.MD` stay consistent (including the flipped window-geometry claim).

## 5. Deferred / TODO

- **Release-safe diagnostics** (structured local logging in production builds) — still deferred from `15_SPEC_POSTMVP-RELEASE-HARDENING.md` §5; remains the next-spec candidate.
- **Play-history identity normalization** — Most Listened keys stay raw to avoid regressing accounting; revisit together with §5 of spec 13.
- **Per-provider threshold tuning / ML-grade matching** — one global `MIN_IDENTITY_SCORE` ships first; provider-specific weights and learned matching are future work (backlog issue #16 territory).
- **Weighted list ranking (`fuse.js`-style)** — `fastest-levenshtein` + token-set scoring covers the current candidate lists; heavier ranking UI/UX is not in scope.
- **Multi-monitor geometry edge cases** (per-monitor DPI, display-configuration changes between sessions) — off-screen re-centering ships; finer behavior is deferred.
- **Maximized/fullscreen state persistence** — only `SIZE | POSITION` are remembered this round.
- **Stable→stable live update spot-check from `0.2.1`** — the path was live-proven in spec 09 (`0.2.0 → 0.2.1`); this release observes the rc→stable convergence instead.
- **Visual regression**, **macOS/Linux packaged validation**, **word-level karaoke**, **OS-keychain AI-key storage** — unchanged deferrals from specs 14/15.
