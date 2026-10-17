# 13_SPEC_POSTMVP-LIVE-CORE-PATCH.md — Post-MVP: Live-Testing Core Patch — Detection, Metadata & Playback Truth

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Track:** Post-MVP (follows `specs/12_SPEC_POSTMVP-UX-REDESIGN.md`; see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD` §5)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Close the **second-round live-testing reliability defects** in the **detection → metadata → playback-clock → lyrics-load** core so that a track detected from Amazon Music shows the **correct title and artist**, the **real album art**, an **uninterrupted karaoke timeline past three minutes**, and **fresh lyrics for every track** — and add a **manual metadata-correction** affordance so testers can fix a wrong title/artist and re-run the provider search themselves.

The work is strictly bounded to the **bridge metadata payload**, **play-history accounting**, the **playback clock**, the **lyrics-load orchestration**, **metadata sanitization**, and the **manual edit/re-search** control. It delivers the app at **`0.5.1`**. It does **not** touch the lyrics panel layout/scrollbars, the provider chain/new providers, or the AI karaoke pipeline (all owned by `14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`).

## 2. Context

This is the **fifth post-MVP spec**, following `specs/12_SPEC_POSTMVP-UX-REDESIGN.md`. Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

### 2.1 Round-2 live-tester feedback (verbatim intent)

Testers re-ran the app after spec 12 and reported the following. The items **owned by this spec** are:

- **"Most listened" should only count Amazon Music songs.**
- There was **no report of a successful album art** being shown — **only the standard fallback**.
- The **karaoke mode lyrics seem to get stuck after 3 minutes**.
- **Sometimes the app simply repeats the last played lyric while a new song is playing.**
- Issues getting the **correct song name/artist**:
    - often the app tried to retrieve **"Artist name" as song name**;
    - sometimes the **artist name could not be retrieved**, displayed as **"Unknown Artist"**.
- Some songs **don't even attempt to search for lyrics** (examples given: *Rasa* by **oktobernatt**, *talk* by **periphery**, *howl* by **the family crest**, *sabada* by **filous**) — **consistent and reproducible**.
- **An option to manually fix an incorrect artist/song name and perform an updated search** through the providers.

The remaining round-2 items — the always-visible lyrics bar, the missing scrollbars, the Genius→karaoke gap, the Lyrica provider, the Genius demotion, and the AI static→synced pipeline — are **owned by `14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`** and are out of scope here.

### 2.2 Root-cause analysis (diagnosed against the code)

1. **Play accounting isn't Amazon-scoped.** `NowPlaying` (`src/types/lyrics.ts:105-113`) carries **no source-app identity**. The Windows bridge *prefers* a playing Amazon session but then **falls back to `GetCurrentSession()` for any app** (`src-tauri/src/bridge/source/windows.rs:103-108`). The scorer is gated only on `detectionRef.current === 'desktop'` (`src/App.tsx:160`), so a concurrent Spotify/YouTube/other SMTC session **increments the play count**.
2. **Album art is fetched from nowhere.** The bridge never reads the SMTC **thumbnail**; there is no `albumArt` field in `NowPlaying`. `resolveDesktopSong` hardcodes an **Unsplash URL** (`src/App.tsx:70`) — a generic network placeholder, not the track's art — and the header falls back to the `Music2` icon whenever that value is empty or fails to load (`src/components/NowPlayingHeader.tsx:29-35`).
3. **The playback clock freezes at 3:00.** The rAF tick clamps the interpolated position to `anchor.durationMs` (`src/App.tsx:155-156`). When SMTC provides **no `EndTime`**, `durationMs` defaults to **`180000`** ms (`src/App.tsx:71-72`; `windows.rs:139-141` returns `None` for a zero/absent timeline), so the highlight **freezes at exactly 180 s** and never resumes — the reported "stuck after 3 minutes".
4. **Lyrics loads are unsequenced and the old song's lyrics stay on screen.** `loadLyrics` (`src/App.tsx:188-205`) has **no request token or abort**, and `KaraokeLyricsView`/`FullSheetLyricsView` only render the loading state when the lyrics array is **empty** — so while the new track's fetch is in flight the **previous** song's lyrics keep rendering, and a **slow response for track A can resolve after track B and overwrite it**. This produces both "repeats the last played lyric" and the perception that some tracks "don't even attempt to search".
5. **Metadata is trusted verbatim.** `resolveDesktopSong` (`src/App.tsx:56-76`) accepts whatever SMTC reports, defaulting the artist to **`Unknown Artist`**, with **no placeholder rejection** (e.g., the literal `"Artist name"`), **no protection for the last good track**, and **no diagnostic surfacing** of the raw session/app id to help testers report.

### 2.3 Current status (implemented through spec 12)

- ✅ Docked lyrics surface (`LyricsPanel`), auto-detected track, `positionMs`-anchored clock, and a local **Most Listened** store (`src/services/playHistoryStore.ts`, ≥ 30 s rule).
- ✅ Real Genius/LRCLIB retrieval through the CORS-free egress layer (`src/services/httpClient.ts` + bridge `/fetch`).
- ✅ Windows bridge prefers a **playing Amazon** SMTC session, else the current session (`windows.rs:85-109`).
- ⬜ **Play counts include non-Amazon sessions** (defect 1).
- ⬜ **No real album art** — no SMTC thumbnail extraction (defect 2).
- ⬜ **Karaoke clock freezes at the 180 s fallback duration** (defect 3).
- ⬜ **Stale lyrics / load races** across track changes (defect 4).
- ⬜ **No metadata sanitization** and no manual correction path (defect 5).

### 2.4 Key decisions (accepted for this spec)

- **Bridge payload extension (additive, camelCase serde):** `NowPlaying` gains `appId: string | null`, `isAmazon: boolean` (computed Rust-side from the existing `is_amazon_app` helper), and `albumArt: string | null`. Album art is read from the SMTC **thumbnail** stream and returned as a size-capped `data:` URL (best-effort; `null` on any failure). The mock source and the macOS/Linux adapters mirror `isAmazon`/`albumArt` where the platform allows, and degrade to `null`/`false` otherwise.
- **Amazon-only play accounting:** `PlayRecord` gains `source: 'amazon' | 'other'`; `recordPlay` receives the source; `getRanking`/`getHistoryStats` count **only** `source === 'amazon'`. **Legacy records recorded before this spec (no `source`) are excluded** from rankings; the existing **Reset History** option remains available.
- **Clock truth:** the clock clamps **only** when the duration is **authoritative** (a positive SMTC `EndTime`). With no timeline the clock **free-runs** (never clamps), so karaoke keeps advancing past three minutes. The `180000` ms value is **display-only** and must never be used as a clamp.
- **Latest-wins lyrics loads:** every `loadLyrics` call takes a **monotonic request id**; only the newest request may apply its result or clear the loading flag. On a track change the panel is **cleared to the new song's empty state before fetching**, so the loading state is always visible and no stale lyric can render or overwrite.
- **Metadata correctness & correction:** placeholder/garbage titles (e.g., a literal `"Artist name"`, blank, or duplicated title/artist) are **rejected** and treated as *not-ready* — the app keeps the last good track instead of loading nonsense — while a genuine missing artist renders a single, deliberate fallback. A **manual edit** control (in `NowPlayingHeader`) lets the user correct title/artist and **re-run the lookup**; corrections persist **per detected track key** (`lyrics-amazon:meta-overrides:v1`) with a **revert**, and are **never written back to SMTC**.
- **Diagnostics:** each provider attempt is logged (dev-only) with the song key, provider, outcome, and elapsed time, and the detected session's **app id** is surfaced in the detection-chip tooltip, so testers can report precisely and the reported tracks can be reproduced.
- **Delivery:** bump the app version **`0.4.0 → 0.5.1`** (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`) and land on `dev`; **no tag, no release, no CI-secret changes**.

**Out of scope for this spec:** the lyrics panel header/scrollbar work, the provider chain order, new providers (Lyrica), and the AI static→synced karaoke pipeline (all owned by `14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`); karaoke/full-sheet rendering semantics; CORS/egress internals; and any release beyond the version bump.

## 3. Tasks and Responsibilities

### 3.1 Bridge Metadata Payload

| Task | Responsibility |
| :--- | :--- |
| Extend `NowPlaying` (Rust `src-tauri/src/bridge/now_playing.rs` + TS `src/types/lyrics.ts`) with `appId`, `isAmazon`, and `albumArt` (additive, backwards-compatible serde). | Delivery |
| Populate `isAmazon` via the existing `is_amazon_app` helper and `appId` from `SourceAppUserModelId`; mirror `isAmazon`/`appId` in the mock, macOS, and Linux sources (`null`/`false` when unavailable). | Delivery |
| Read the SMTC **thumbnail** (`GlobalSystemMediaTransportControlsSessionMediaProperties.Thumbnail`) and emit a size-capped `data:` URL (best-effort, `null` on failure); add Rust tests for the encode/size-cap and the `isAmazon` computation. | Delivery & Quality |

### 3.2 Most Listened — Amazon-Only Play Accounting

| Task | Responsibility |
| :--- | :--- |
| Thread the detection source (`isAmazon`) into the scorer/`recordPlay` call site (`src/App.tsx`) and into `PlayRecord.source`. | Delivery |
| Update `getRanking`/`getHistoryStats` (`src/services/playHistoryStore.ts`) to count **only** Amazon-sourced records; exclude legacy unflagged records. | Delivery & Quality |
| Extend tests to cover Amazon gating, the legacy-record exclusion, and non-Amazon sessions incrementing nothing. | Quality |

### 3.3 Playback Clock Truth (no 3-minute freeze)

| Task | Responsibility |
| :--- | :--- |
| Track whether the duration is **authoritative** (positive SMTC `EndTime`) and clamp the clock **only** then; free-run when unknown. | Delivery |
| Keep the `180000` ms value display-only; the karaoke highlight must keep advancing past 180 s when no real duration is known. | Delivery |
| Add clock tests: free-run past the fallback duration when unknown; clamp correctly when a real duration is present. | Quality |

### 3.4 Lyrics-Load Sequencing & Loading-State Correctness

| Task | Responsibility |
| :--- | :--- |
| Add a monotonic request id (and abort of the superceded request) so only the newest `loadLyrics` may apply its result / toggle `isLoadingLyrics`. | Delivery |
| On a track change, clear the panel to the new song's empty state **before** fetching so the loading state is visible and no stale lyric renders. | Delivery |
| Add regression tests: a slow track-A response completing after track-B must not overwrite B; the loading state shows during fetch; a not-found result renders the genuine empty state. | Quality |

### 3.5 Metadata Sanitization & Detection Diagnostics

| Task | Responsibility |
| :--- | :--- |
| Reject placeholder/garbage metadata (literal `"Artist name"`, blanks, duplicated title/artist) and keep the **last good track** instead of loading nonsense. | Delivery |
| Render a single deliberate artist fallback when the artist is genuinely absent, and parse a `"Title - Artist"` split when present. | Delivery |
| Log each provider attempt (dev-only: key, provider, outcome, ms) and surface the detected **app id** in the detection-chip tooltip. | Delivery & Quality |
| Reproduce and verify the four reported tracks (*Rasa*, *talk*, *howl*, *sabada*) through the full path; add them as smoke/regression cases. | Quality |

### 3.6 Manual Metadata Correction & Re-search

| Task | Responsibility |
| :--- | :--- |
| Add an **edit** control to `NowPlayingHeader` opening a small dialog to correct title/artist (pre-filled from the detected values). | Delivery |
| On apply, persist the override per detected track key (`lyrics-amazon:meta-overrides:v1`), have `resolveDesktopSong` prefer the override, and **re-run the provider lookup** ignoring the cache for that track. | Delivery & Quality |
| Provide a **revert** to the detected metadata; overrides never write back to SMTC. | Quality |
| Add tests for the override store (persist, apply precedence, revert, keying). | Quality |

### 3.7 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Keep every existing gate green: `npm run lint`, `npm run build`, `npm run test`, `npm run coverage:report` (≥ 85% combined), `cargo fmt --check`, `cargo clippy --all-targets`, `cargo test`, `npm run test:e2e`, `npm run smoke`, `npm run bridge:smoke`. | Quality |
| Keep coverage **≥ 85% global** and **100% of critical utilities** (updated set: the play-history/Amazon gate, the playback-clock rule, the lyrics-load sequencing, and the metadata-override store). | Quality |
| Limit changes to the bridge metadata payload, play accounting, the clock, lyrics-load orchestration, sanitization/diagnostics, and the manual edit control — no panel layout/scrollbars, provider-chain, or AI-karaoke changes. | Quality |
| Introduce no secrets; `.env*` stays ignored; new state is local-only (localStorage). | Code Safety (per `00_AI-SAFE.md`) |
| **Bump the app version to `0.5.1`** across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` (root package only; `Cargo.lock` regenerates); do **not** tag or publish; do **not** implement the §5 deferred items. | Delivery / Code Safety |
| Keep the README, `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

## 4. Definition of Done

- [x] A detected Amazon Music track shows its **real album art** end-to-end; the hardcoded Unsplash placeholder is gone and the header falls back to the icon only when art is genuinely unavailable.
- [x] **Most Listened counts only Amazon Music** sessions; non-Amazon SMTC plays increment nothing and legacy unflagged records are excluded from rankings.
- [x] Karaoke keeps advancing **past three minutes** — the clock never freezes at the 180 s fallback (it clamps only against a real SMTC duration).
- [x] A new track **never shows the previous song's lyrics**; a slow stale response cannot overwrite the current track, and the loading state is visible during every fetch.
- [x] Placeholder/garbage metadata is **rejected** (no literal `"Artist name"` used as a title; `"Unknown Artist"` appears only for a genuinely missing artist), and the last good track is preserved.
- [x] The user can **manually fix** an incorrect title/artist and **re-run the provider search**; the correction persists per track, is revertible, and never writes back to SMTC.
- [x] Each provider attempt is logged (dev-only) and the detected session **app id** is surfaced for diagnostics.
- [x] The four reported tracks (*Rasa*, *talk*, *howl*, *sabada*) are reproduced and verified through the full path (with smoke/regression coverage).
- [x] New tests cover Amazon gating, the unknown-duration clock, the load race, metadata sanitization, and the override store.
- [x] All existing quality gates pass (lint, build, Vitest, coverage ≥ 85% with 100% of critical files, fmt, clippy, Rust tests, E2E, `smoke`, `bridge:smoke`), with new tests covering the added behavior.
- [x] No secrets are committed; `specs/PROMPTS.md` records this spec; the README and `specs/PROJECT_OVERVIEW.MD` stay consistent.
- [x] The app version is bumped to **`0.5.1`**; **no tag or release** was produced and no §5 deferred items were introduced.

## 5. Deferred / TODO

- **Provider-chain order, the Lyrica provider, and the AI static→synced karaoke pipeline** — owned by `14_SPEC_POSTMVP-LYRICS-UX-KARAOKE.md`.
- **OS-keychain / server-side AI-key storage** — still deferred per `05_SPEC_AIFALLBACK.md` §5.
- **Live macOS/Linux metadata validation** (thumbnail + `appId` on MediaRemote/MPRIS) — CI runners are headless; the payload extension is platform-neutral with `null`/`false` degradation.
- **Packaged-app E2E (`tauri-driver`)** and **visual regression** — still parked (see `08_SPEC_HARDENING.md` §5).
- **Richer Most Listened analytics / cross-device sync** — local-only for now.
