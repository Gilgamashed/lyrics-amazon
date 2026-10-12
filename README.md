# Lyrics for Amazon Music — Floating Lyrics Companion

A standalone, desktop-style companion that retrieves synchronized lyrics and Genius annotations for songs currently playing on **Amazon Music** and displays them in a floating, translucent, draggable, and resizable glass window.

- **Lyrics providers:** Genius, LRCLIB (synchronized LRC), curated local database.
- **Playback sync:** click-to-seek, auto-scroll, and `±0.5s` / `±0.1s` offset calibration.
- **Dual display modes:** Synchronized Karaoke and Full Lyrics Sheet.
- **Window experience:** opacity/blur sliders, pin-to-top, minimize-to-pill, resize handles, and window presets.

> Status: Phase 5 (Customizable AI Fallback) — see `specs/PROJECT_OVERVIEW.MD` for the roadmap and `specs/00_AI-SAFE.md` for the SpecDD scope rules.

## Prerequisites

- [Node.js](https://nodejs.org/) (npm included)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables by copying the example file and filling in your keys:

   ```bash
   copy .env.example .env.local
   ```

   Required for AI-powered lyrics fallback:

   - `GEMINI_API_KEY` — Gemini API key (AI Studio injects it at runtime from secrets).
   - `APP_URL` — the URL where the applet is hosted (used for self-referential links and API endpoints).
   - `VITE_AI_PROVIDER_URL` — OpenAI-compatible base URL for the provider-agnostic AI fallback (e.g. `https://api.openai.com/v1`).
   - `VITE_AI_MODEL` — model name sent to that endpoint (e.g. `gpt-4o-mini`).

   The AI **API key is never read from env** (that would expose it in the client bundle). Enter it in the in-app **AI Options** menu — see [AI Lyric Fallback](#ai-lyric-fallback).

   Secrets stay local — `.env*` files are git-ignored (only `.env.example` is tracked).

## Run

```bash
npm run dev
```

The app boots at `http://localhost:3000`.

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the Vite dev server (port 3000). |
| `npm run build` | Build the production bundle into `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Typecheck with `tsc --noEmit`. |
| `npm run clean` | Remove `dist/` and `server.js`. |

## Project Structure

```
src/
  types/       Domain types (Song, LyricLine, LyricsData, WindowState, ...)
  services/    Lyric engine (LRCLIB/Genius retrieval, LRC parsing, curated tracks)
  components/  UI (FloatingLyricsWindow, KaraokeLyricsView, FullSheetLyricsView, ...)
specs/
  PROJECT_OVERVIEW.MD   Project overview & 7-phase roadmap
  00_AI-SAFE.md         SpecDD scope-restriction guideline
  0N_SPEC_*.md          Per-phase specifications
  PROMPTS.md            AI prompt & decision history
```

## Lyrics Cache

Recently played song lyrics are cached **in memory** (no persistence) to avoid re-fetching from LRCLIB on repeat plays.

- **Scope:** `fetchLyrics` results only (recently played song data); search results are not cached.
- **Key:** normalized `title|artist`.
- **Bounded:** max 20 entries (LRU-style eviction of oldest on overflow).
- **TTL:** entries expire after 7 days.
- **Bypass:** `fetchLyrics(song, { useCache: false })` skips both cache lookup and write.
- Created in `src/services/lyricsCache.ts`; exports `getCachedLyrics`, `setCachedLyrics`, `clearLyricsCache`, `getCacheStats`.

## AI Lyric Fallback

When a track has no coverage in the curated database, LRCLIB, or Genius, the app can synthesize synchronized lyrics and annotations through a **provider-agnostic** adapter over any **OpenAI-compatible** `chat/completions` endpoint.

- **Configuration:** endpoint and model are resolved from the **AI Options** menu (top bar) first, then from `VITE_AI_PROVIDER_URL` / `VITE_AI_MODEL`. A Google Gemini model is an option, not a requirement.
- **API key:** entered in the **AI Options** menu and held **in memory for the session only** — it is never written to disk, env, or the client bundle. It is sent only to the provider you configure.
- **Requests:** issued directly from the browser via `fetch` to `${providerUrl}/chat/completions`. Some providers may reject cross-origin requests (CORS) — if so, run the app behind a proxy for that provider.
- **Persistence:** AI-generated results (`provider: "AI Sync"`) are saved **permanently in `localStorage`** (keyed by `title|artist`, no expiry) and reused on repeat plays. Use **Clear** in the AI Options menu to remove them.
- **Fallback:** if the provider is unconfigured, unreachable, times out, or returns malformed data, the app silently falls back to the canned lyrics without blocking playback.

> Security note: keeping a built-in key out of the client would require a server-side proxy (the key never reaches the browser). This is intentionally deferred — see `specs/05_SPEC_AIFALLBACK.md` §5.

## Runtime Smoke-Verification

Exercise the lyric engine against live LRCLIB with and without cache:

```bash
npm run smoke
```

Uses a track that is **not** in the curated database (e.g., *Yesterday — The Beatles*) to force a real network request, then measures cold fetch vs warm cache-hit latency.

Result of a live run (2026-10-12):

| Pass | `useCache` | Latency | Provider | Lines |
| :--- | :--- | ---: | :--- | ---: |
| Cold (forced network) | `false` | 400 ms | LRCLIB | 20 |
| Warm (cache miss) | `true` | 223 ms | LRCLIB | 20 |
| Warm (cache hit) | `true` | 0 ms | LRCLIB | 20 |

The cache-hit pass avoids the network round-trip entirely (0 ms), confirming `fetchLyrics` returns cached `LyricsData` for repeat plays.