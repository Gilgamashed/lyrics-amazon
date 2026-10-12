# 02_SPEC_LYRIC_ENGINE.md — Phase 2: Core Lyric Engine

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Phase:** 2 of 8 (see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD`)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Deliver the multi-provider lyric engine that powers the app: LRC parsing, lyrics retrieval from LRCLIB and the curated Genius-backed database, track search with suggestions, curated track coverage, and graceful fallback generation for tracks with no provider coverage — so the floating window can always source synchronized lyrics.

## 2. Context

This is Phase 2 of the 8-phase roadmap described in `specs/PROJECT_OVERVIEW.MD` (§5: "Core lyric engine: LRC parsing, LRCLIB + Genius retrieval, search with suggestions, curated track database, and fallback generation"). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (gap-closure note):** The repository already contains most of the lyric engine:

- ✅ `src/services/lyricsService.ts`:
  - `parseLrc(lrcText)` — parses LRC timestamps (`[mm:ss.xxx]`) into typed `LyricLine[]` with section detection (verse/chorus/bridge/intro/outro/instrumental) and chronological sorting.
  - `searchTracks(query)` — local curated filter + remote LRCLIB search (`/api/search`) with a 3.5s `AbortController` timeout, deduplicated merge of local + remote results, and a fallback custom track when no matches exist.
  - `fetchLyrics(song)` — provider cascade: curated database → LRCLIB synced lyrics (`/api/get`, 4s timeout) → LRCLIB plain lyrics with synthesized timestamps → `createFallbackLyrics(song)`.
  - `createFallbackLyrics(song)` — canned stanza bank with timestamps, generated Genius-style annotations, trivia, and track info.
  - `generateSmartAnnotations(title, artist, lines)` — programmatic Genius-style annotations for provider-fetched tracks.
- ✅ `src/services/curatedTracks.ts` — curated `CURATED_TRACKS` + rich `CURATED_LYRICS_DATA` (synced lines, annotations, trivia, track info).
- ✅ `src/services/lyricsCache.ts` — in-memory LRU-style cache for recently played lyrics (max 20 entries, 7-day TTL, `title|artist` key, `getCachedLyrics`/`setCachedLyrics`/`clearLyricsCache`/`getCacheStats`).
- ✅ `scripts/smoke-lyrics.ts` + `npm run smoke` — runtime smoke-verification against live LRCLIB with and without cache (results documented in README).
- ✅ `src/types/lyrics.ts` — domain types (`Song`, `LyricLine`, `LyricsData`, `GeniusAnnotation`, `WindowState`, `ViewMode`, `WindowPreset`).

**Out of scope for this phase:** the pluggable AI adapter and AI-synthesized lyrics (Phase 5), playback sync via media-session (Phase 4), and the native companion bridge (Phase 6) — none may be introduced here per `00_AI-SAFE.md`.

## 3. Tasks and Responsibilities

### 3.1 Documentation & Delivery

| Task | Responsibility |
| :--- | :--- |
| Verify `parseLrc` correctly handles millisecond LRC timestamps, multi-tag lines, and section tags. | Delivery & Quality |
| Verify `searchTracks` merges curated + remote LRCLIB results without duplicates and handles timeout/network failure gracefully (falls back to local/custom). | Delivery |
| Verify `fetchLyrics` follows the provider cascade (curated → LRCLIB synced → synthesized plain → fallback) and always returns valid `LyricsData`. | Delivery |
| Verify the in-memory lyric cache (`lyricsCache.ts`) is integrated into `fetchLyrics` (lookup first, write on miss) with a `useCache: false` bypass. | Delivery & Quality |
| Run `npm run smoke` against live LRCLIB to verify the engine with and without cache, and document the findings in the README. | Delivery |
| Confirm `curatedTracks.ts` provides song + lyrics data consumed by the rest of the app. | Delivery |
| Keep `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

### 3.2 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Do not implement Phase 3–6 features (window presets/karaoke polish, playback sync, AI adapter, native companion). | Code Safety (per `00_AI-SAFE.md`) |
| Do not add unnecessary dependencies. | Quality |
| Keep typecheck/lint clean (`npm run lint`). | Quality |
| Do not commit secrets; `.env*` remains ignored, referenced only via `.env.example`. | Code Safety |

## 4. Definition of Done

- [x] `src/services/lyricsService.ts` provides `parseLrc`, `searchTracks`, and `fetchLyrics` used by the app.
- [x] LRC parsing handles timestamped lines, section tags, and returns chronologically sorted `LyricLine[]`.
- [x] Search returns deduplicated results merging curated + LRCLIB, with graceful timeout/offline fallback.
- [x] Lyric retrieval cascades correctly (curated → synced → synthesized → fallback) and always returns valid `LyricsData`.
- [x] In-memory lyric cache caches recently played lyrics (memory-only, bounded 20 entries, 7-day TTL), integrates into `fetchLyrics`, and supports a `useCache: false` bypass.
- [x] `npm run smoke` runs successfully against live LRCLIB and its with/without-cache findings are documented in the README.
- [x] `curatedTracks.ts` provides curated tracks + rich lyrics data (synced lines, annotations, trivia).
- [x] Domain types in `src/types/lyrics.ts` cover songs, lyrics, annotations, and window state.
- [x] `npm run lint` (`tsc --noEmit`) passes with no errors.
- [x] No Phase 3–6 features were introduced during this phase.