# 17_SPEC_POSTMVP-DIAGNOSTICS-AND-LOOKUP-RECOVERY.md — Post-MVP: In-App Diagnostics Terminal & Lookup Recovery — the `0.5.5-rc.2` Release

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows `specs/16_SPEC_POSTMVP-FUZZY-LOOKUP-RELEASE.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Close the **fourth round of live-testing feedback** (`specs/feedback04.txt`): give the user an **in-app debug terminal** that records every detection, lookup, provider, gate, cache and UI decision so a failing song can be diagnosed without a debugger, and repair the **lookup failures** the terminal exposes — a reading that is silently dropped, a polluted query, a transient provider outage, and a fuzzy-match gap.

The delivery line is **`0.5.5-rc.2`**, published to the **`test-latest`** channel (release candidates only; no stable cut in this spec).

> **Release note:** `v0.5.5-rc.1` was tagged from an incomplete commit (version bump + normalization only; the implementation was still uncommitted) and is superseded by `v0.5.5-rc.2`, which contains the full diagnostics terminal and lookup-recovery work.

The work is strictly bounded to the **diagnostics surface**, the **metadata admission rules**, the **provider request policy** and the **lookup identity variants**. It does not touch the window chrome, the karaoke alignment pipeline, the release-channel plumbing, or the AI key handling.

## 2. Context

### 2.1 Round-4 feedback (intent)

- The app must expose a **debug terminal** (an in-app console) listing what the app detected and did, so "it shows no lyrics" becomes an answerable question.
- Certain songs **never** find lyrics ("the cursed songs") even though the songs are on every provider.
- Metadata reported by the music player is frequently **wrong or incomplete** (no title, title == artist, no artist), and the manual fix must work in that situation too.

### 2.2 Diagnosed root causes (live evidence, 2026-10)

All findings were reproduced against the running bridge (`http://127.0.0.1:48765`), the live Amazon Music SMTC source and the live providers.

| # | Root cause | Evidence |
| :--- | :--- | :--- |
| **RC1** | **The reading is dropped before any lookup.** `sanitizeMetadata` returns `null` for a blank title (`metadataSanitizer.ts:60`) and for `title === artist` (`metadataSanitizer.ts:62`), and the desktop handler then keeps the previous track (`App.tsx:407-412`). The Fix button is also a no-op in that state, because `handleApplyOverride` re-sanitizes the same raw reading and bails out (`App.tsx:377-378`). | Live SMTC readings: `The Red` → title `''`, artist `'Chevelle'`; `It Dies Today` → title `''`, artist `'It Dies Today'`; `Much The Same` → title == artist; `Obsession` → title `'Periphery'`, artist `'Periphery'` (the album name in the title slot). |
| **RC2** | **A missing artist is put on the wire.** `sanitizeMetadata` substitutes `Unknown Artist` (`metadataSanitizer.ts:64`), and the LRCLIB query is built from the sanitized strings (`lrclib.ts:109,133`) → `q=breed unknown artist` → **0 hits**, while `q=breed nirvana` → 10 hits. | Live LRCLIB probes. |
| **RC3** | **Transient provider outages are treated as "not found".** LRCLIB answers HTTP **503** `{"name":"ServerOverload"}` under load; the retry only covers **429** (`lrclib.ts:28-35`), and the swallowed `catch` turns the failure into an empty result (`lrclib.ts:145`). | Live LRCLIB probes: first call 503, subsequent calls 200. |
| **RC4** | **`/api/get` is called with `duration=0`** whenever the player reports no duration → HTTP **400** `duration: must be between 1 and 3600`, burning ~0.8 s of the 4 s provider budget before the search fallback runs. | Live LRCLIB probe with `duration=0`. |
| **RC5** | **Fuzzy gaps.** `feat.`/`(feat. …)` credits survive normalization (`textNormalize.ts:40`), non-Latin titles normalize to `''`, empty-vs-empty similarity is `1.0`, and a `"Artist - Title"` title produces a polluted, duplicated query. | `textNormalize.ts` / `matchScore.ts` inspection. |

**Not a root cause:** Genius is alive — its hits live under `response.sections[].hits`, which `collectHits` already handles (`genius.ts:122-130`). An earlier probe that reported "0 hits" was a probe bug, not an API change.

### 2.3 Current status (implemented through spec 16)

- ✅ A per-track manual fix exists (edit dialog + `metaOverrideStore`, persisted).
- ✅ A fuzzy identity gate exists (`matchScore.ts`, `MIN_IDENTITY_SCORE = 0.8`) and every provider candidate is gated.
- ✅ The provider chain (`LRCLIB → Lyrica → Genius`) degrades provider-by-provider, and the local-first order (accepted → saved AI → cache → chain → live AI) is deterministic.
- ⬜ **No diagnostics surface**: `devLog` writes to the developer console only, is compiled out of production, and the user cannot see or export it.
- ⬜ **A reading that fails sanitization is dropped silently** — no log, no UI hint, and the Fix dialog cannot recover from it.
- ⬜ **No retry policy for 5xx**, no `/api/get` duration guard, and no distinction between *not found* and *transient failure*.

### 2.4 Key decisions (accepted for this spec)

- **The diagnostics terminal is an in-app overlay, not a devtools panel.** It is opened with **Ctrl+Shift+D** or from the **Options** menu, and it is available in **development and release-candidate builds only**; stable builds must not ship it. The gate is the app version's prerelease tag (`-rc.N`, `-beta`, `-alpha`) plus an explicit `VITE_DEBUG_TERMINAL=1|0` override.
- **The terminal keeps a bounded in-memory ring buffer (2000 events)** and mirrors every event to the developer console. It never persists to disk and never leaves the machine except through the explicit **"Copy report"** action, which exports version, platform and the retained events as JSON.
- **Logging is throttled by meaning, not by time.** The bridge republishes on every poll tick (the position moves), so only *identity changes* are recorded; a metadata decision is recorded when the decision changes. The buffer must stay readable.
- **A reading is never dropped again (W2).** Sanitization returns a **status** (`ok | missing-title | placeholder | duplicate`) instead of `null`; the app adopts the track anyway, shows **"Title not reported — fix to search"**, and the Fix dialog works. `title === artist` is read as *title-only* (the artist is unknown), not as a rejection.
- **The artist is never invented on the wire (W2/W4).** An unknown artist produces a **title-only query**; `"Artist - Title"` is split before the query is built; an artist-scoped memory remembers the title the user confirmed for that artist.
- **Transient failures are retried and classified (W3).** The provider retries 429/500/502/503/504 with backoff and reports the attempt count; the chain re-runs once after a transient failure; the outcome is classified as `found | not-found | transient-error | gate-rejected`; the UI offers **Retry**. A 5xx must never be reported as *"Lyrics not found"*.
- **`/api/get` is skipped when the duration is unknown (W3).** Only `/api/search` runs; the duration rule applies to search candidates only.
- **The identity gate becomes tiered (W4).** Unicode-safe normalization, `feat.` credit variants, multiple query variants (full, title-only, artist+title) and a documented tier rule — the candidate must always match the title; the artist is matched when it is known.
- **The UIAutomation fallback is a separate spec (18).** The CEF accessibility tree of Amazon Music exposes the real title (`Breed` / `Nirvana`), but the tree is transient (896 elements once, then 4) and `ControlType` conditions return nothing, so a reliable UIA reader needs its own spec, its own retry policy and its own release. It must never block the main flow.

**Out of scope for this spec:** the UIA metadata fallback (spec 18); the window chrome and layout presets; the karaoke alignment pipeline; the AI prompt and key handling; the release-channel plumbing beyond cutting this rc line; the play-history identity; macOS/Linux packaged validation; word-level karaoke.

## 3. Work Packages

### 3.1 W1 — In-App Diagnostics Terminal (delivered in this pass)

| Task | Responsibility |
| :--- | :--- |
| Add `src/services/debugConsole.ts` — a bounded ring buffer (2000 events), `debugLog(scope, event, data, level)`, a subscribe API for React, the build gate (dev / prerelease / `VITE_DEBUG_TERMINAL`) and a JSON diagnostics-report builder. | Delivery |
| Add `src/components/DebugTerminal.tsx` — an overlay with level chips, a scope filter, a free-text filter, auto-follow, **Clear** and **Copy report**; a row expands to the full payload. | Delivery |
| Open the terminal with **Ctrl+Shift+D** and from the **Options** menu; the entry exists only when the build exposes it. | Delivery |
| Instrument every decision point: the raw bridge reading, the metadata admission decision, the track change, the override apply/revert, the lookup start/end, the local-store hits, each provider request (URL, status, attempts, duration), the identity-gate rejections with their scores, the chain outcome, and the user actions. | Delivery |
| Make the rejection reason explicit: `inspectMetadata` returns the reason (`missing-title`, `placeholder-title`, `duplicate-title-artist`) and `evaluateIdentityGate` returns the scores and the rejection kind — both additive, the existing behaviour is unchanged. | Delivery & Quality |
| Tests: ring-buffer bound, subscribe/unsubscribe, clear, report payload, the build gate (forced on/off), the terminal's filters, clear, close; and an E2E that opens the terminal against the real bridge and asserts the recorded detection. | Quality |

### 3.2 W2 — Never Drop a Track

| Task | Responsibility |
| :--- | :--- |
| Replace the `null`-returning sanitizer with a status result; adopt the track in every case; keep the previous track only when the reading is genuinely empty (no title and no artist). | Delivery |
| Show **"Title not reported — fix to search"** in the header when the title is missing; the Fix dialog opens with the known artist and an empty title. | Delivery |
| Read `title === artist` as *title-only* (artist unknown) instead of rejecting the reading. | Delivery |
| Remember the title the user confirmed for an artist (artist-scoped memory) so the next reading of that artist resolves without asking again. | Delivery |
| Tests: every SMTC shape observed live (`''`+artist, title==artist, title+`''`, album-in-title) reaches the lookup with a usable query. | Quality |

### 3.3 W3 — Provider Robustness and Outcome Classification

| Task | Responsibility |
| :--- | :--- |
| Retry 429/500/502/503/504 with bounded backoff; report the attempt count; never convert a 5xx into an empty success. | Delivery & Quality |
| Skip LRCLIB `/api/get` when the duration is unknown or ≤ 0; keep the duration rule for search candidates only. | Delivery |
| Classify the lookup outcome as `found | not-found | transient-error | gate-rejected` and surface **Retry** for the transient case. | Delivery |
| Re-run the chain once after a transient failure instead of ending the request. | Delivery |
| Tests: 503 → retry → success; 503 → transient-error (not "not found"); `duration=0` never reaches `/api/get`; the outcome classification drives the Retry button. | Quality |

### 3.4 W4 — Lookup Identity Variants and Tiered Gate

| Task | Responsibility |
| :--- | :--- |
| Make the normalization Unicode-safe (non-Latin titles must not normalize to an empty string) and strip `feat.`/`ft.` credit variants. | Delivery |
| Build several query variants (full, title-only, artist + title) and try them in order; an unknown artist never appears on the wire. | Delivery |
| Tiered gate: the title must always match; the artist is matched only when it is known; a decorated candidate (`(Remastered 2021)`, `[Explicit]`) still passes. | Delivery |
| Split a `"Artist - Title"` title before the query is built so the query is never polluted or duplicated. | Delivery |
| Tests: the four live samples (`Breed`, `The Red`, `It Dies Today`, `Much The Same`) and a non-Latin title resolve against the recorded provider behaviour. | Quality |

### 3.5 W5 — Release `0.5.5-rc.2` to the test channel

| Task | Responsibility |
| :--- | :--- |
| Bump `0.5.4 → 0.5.5-rc.2` across the version files (`package.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`), land on `dev`, tag `v0.5.5-rc.2`, publish through the spec-15 gated pipeline to the **`test-latest`** channel only. | Delivery |
| Update `README.md`, `specs/PROJECT_OVERVIEW.MD` and `specs/PROMPTS.md` with the diagnostics surface and the recovered lookup behaviour. | Delivery |
| Verify: the installed rc observes the detection decisions in the terminal, the four cursed songs resolve, and a transient provider failure shows **Retry** instead of "not found". | Quality |

## 4. Definition of Done

- **W1:** `Ctrl+Shift+D` opens an overlay that lists the raw bridge reading, the metadata decision, the track change, the provider requests (URL, status, attempts, ms), the gate rejections with their scores, the chain outcome and the user actions; it filters by level, scope and text, clears, and exports a JSON report; it is present in dev and rc builds and absent from stable builds.
- **W2:** No reading is dropped silently; the header states that the title was not reported; the Fix dialog completes the search.
- **W3:** A transient provider failure is retried, reported as transient, and offers Retry; it is never shown as "Lyrics not found"; `/api/get` is never called with an invalid duration.
- **W4:** The four live cursed songs resolve; an unknown artist never reaches a provider; a non-Latin title is not normalized away.
- **W5:** `v0.5.5-rc.2` is published to `test-latest`, the docs are updated, and the unit + E2E suites are green.

## 5. Deferred

- **Spec 18 — UIAutomation metadata fallback.** The Amazon Music window is a CEF application whose accessibility tree exposes the real title/artist (`Breed` / `Nirvana` / `Nevermind (Remastered) [Explicit]`). Reading it reliably requires: an anchor on the elapsed-time text (`^-?\d{1,2}:\d{2}$`), an upward walk with `RawViewWalker` to the title, a bounded retry/backoff for the transient tree, and a tolerance for duplicate player bars with different clocks. This spec records the evidence and the constraints; the implementation ships after `0.5.5-rc.2` is out.
