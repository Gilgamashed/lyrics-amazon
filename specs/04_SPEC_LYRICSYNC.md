# 04_SPEC_LYRICSYNC.md — Phase 4: Playback Sync

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Phase:** 4 of 8 (see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD`)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Keep lyrics locked to the Amazon Music stream: a real-time playback timer driving `currentTimeMs`, browser `navigator.mediaSession` integration (metadata plus play/pause/seek action handlers), and `±0.5s` / `±0.1s` sync-offset calibration applied to lyric highlighting — so the karaoke view stays in step with the user's exact audio.

## 2. Context

This is Phase 4 of the 8-phase roadmap described in `specs/PROJECT_OVERVIEW.MD` (§5: "Playback sync: media-session integration, playback timer, and `±0.5s` offset calibration"). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (gap-closure note):** The repository already contains most of the playback-sync layer:

- ✅ `src/App.tsx`:
  - Playback timer via a `requestAnimationFrame` loop accumulating `Date.now()` deltas while `isPlaying`, looping at `song.durationMs`, with unmount cleanup (`App.tsx:55`).
  - Media Session integration guarded by `'mediaSession' in navigator`: sets `MediaMetadata` (title/artist/album/artwork) and registers `play`, `pause`, and `seekto` action handlers (`App.tsx:100`).
  - `currentTimeMs` / `syncOffsetMs` state with `onSeek` (sets playback time), `onOffsetChange` (sets calibration offset), and a time reset on song change (`App.tsx:84`).
- ✅ `src/components/AmazonMusicBar.tsx` — play/pause toggle, time scrubber bound to `currentTimeMs`, the sync-calibration popup (`−0.5s` / `−0.1s` / `+0.1s` / `+0.5s`, Reset, and live "Current Offset" display), and the media-session auto-detect toggle.
- ✅ `src/components/KaraokeLyricsView.tsx` — applies `effectiveTimeMs = currentTimeMs + syncOffsetMs` to active-line detection.
- ✅ `src/components/FloatingLyricsWindow.tsx` / `src/components/FullSheetLyricsView.tsx` — forward `currentTimeMs`, `syncOffsetMs`, and `onSeek`; per-line click-to-seek.

**Out of scope for this phase:** OS-level desktop-app detection via the native companion bridge (Windows SMTC / macOS MediaRemote / Linux MPRIS — Phase 6) and the pluggable AI adapter (Phase 5) — neither may be introduced here per `00_AI-SAFE.md`. The browser Media Session API detects only the in-browser Amazon Music web player.

## 3. Tasks and Responsibilities

### 3.1 Documentation & Delivery

| Task | Responsibility |
| :--- | :--- |
| Verify the playback timer advances `currentTimeMs` in real time, loops at track end, and is cleaned up on unmount. | Delivery & Quality |
| Verify Media Session metadata (title/artist/album/artwork) is set from the current song. | Delivery |
| Verify the `play`, `pause`, and `seekto` Media Session action handlers update local playback state. | Delivery & Quality |
| Verify Media Session access is guarded for environments where the API is unavailable. | Quality |
| Verify sync calibration provides `±0.5s` / `±0.1s` adjustments, a reset, and a live offset readout. | Delivery & Quality |
| Verify the karaoke view applies `syncOffsetMs` to active-line detection. | Delivery |
| Verify click-to-seek from the karaoke and full-sheet views updates `currentTimeMs`, and selecting a song resets playback time. | Delivery |
| Keep `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

### 3.2 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Do not implement Phase 5–6 features (pluggable AI adapter, native companion bridge for desktop-app detection). | Code Safety (per `00_AI-SAFE.md`) |
| Do not add unnecessary dependencies. | Quality |
| Keep typecheck/lint clean (`npm run lint`). | Quality |
| Do not commit secrets; `.env*` remains ignored, referenced only via `.env.example`. | Code Safety |

## 4. Definition of Done

- [x] A real-time playback timer drives `currentTimeMs` and loops at `song.durationMs` (`src/App.tsx`).
- [x] The playback timer is cleaned up on unmount and paused when `isPlaying` is false.
- [x] Media Session metadata (title/artist/album/artwork) is set from the current song.
- [x] Media Session `play`, `pause`, and `seekto` action handlers are registered and update playback state.
- [x] Media Session access is guarded when `'mediaSession' in navigator` is false.
- [x] `syncOffsetMs` state is wired from the calibration controls via `onOffsetChange`.
- [x] Sync calibration offers `±0.5s` and `±0.1s` adjustments plus reset, with a live offset readout (`src/components/AmazonMusicBar.tsx`).
- [x] The karaoke view applies `effectiveTimeMs = currentTimeMs + syncOffsetMs` to active-line detection (`src/components/KaraokeLyricsView.tsx`).
- [x] Click-to-seek from the karaoke and full-sheet views updates `currentTimeMs`, and selecting a song resets playback time.
- [x] `npm run lint` (`tsc --noEmit`) passes with no errors.
- [x] No Phase 5–6 features were introduced during this phase.
