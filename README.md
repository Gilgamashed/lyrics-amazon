# Lyrics for Amazon Music — Floating Lyrics Companion

A standalone, desktop-style companion that retrieves synchronized lyrics and Genius annotations for songs currently playing on **Amazon Music** and displays them in a floating, translucent, draggable, and resizable glass window.

- **Lyrics providers:** Genius, LRCLIB (synchronized LRC), curated local database.
- **Playback sync:** click-to-seek, auto-scroll, and `±0.5s` / `±0.1s` offset calibration.
- **Dual display modes:** Synchronized Karaoke and Full Lyrics Sheet.
- **Window experience:** opacity/blur sliders, pin-to-top, minimize-to-pill, resize handles, and window presets.

> Status: Phase 1 (Project Scaffolding) — see `specs/PROJECT_OVERVIEW.MD` for the roadmap and `specs/00_AI-SAFE.md` for the SpecDD scope rules.

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