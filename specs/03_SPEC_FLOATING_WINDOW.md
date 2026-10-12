# 03_SPEC_FLOATING_WINDOW.md — Phase 3: Floating Window UX

**Project:** Lyrics for Amazon Music (Amazon Music Floating Lyrics)
**Phase:** 3 of 8 (see Delivery Roadmap in `specs/PROJECT_OVERVIEW.MD`)
**Governed by:** `specs/00_AI-SAFE.md` (SpecDD)

---

## 1. Objective

Deliver the floating-window user experience that defines the app: a translucent, draggable, edge/corner-resizable glass window with opacity, blur, theme, and font-size controls; pin/always-on-top, minimize-to-floating-pill, maximize/restore, and layout presets — hosting the two display modes (**Synchronized Karaoke** with click-to-seek and auto-scroll, and the **Full Lyrics Sheet** with verse headers, font sizing, search, and copy) plus the **Genius annotations & trivia drawer**, floating above a mock desktop canvas that shows through the glass.

## 2. Context

This is Phase 3 of the 8-phase roadmap described in `specs/PROJECT_OVERVIEW.MD` (§5: "Floating window UX: draggable/resizable glass window, opacity/blur/pin/minimize/presets, karaoke (click-to-seek, auto-scroll) and full-sheet modes, Genius annotations drawer"). Development follows the SpecDD methodology and the scope-restriction rules of `specs/00_AI-SAFE.md`: only the surface area declared by this spec is in scope.

**Current status (gap-closure note):** The repository already contains most of the floating-window UX:

- ✅ `src/components/FloatingLyricsWindow.tsx`:
  - Pointer-based title-bar dragging with viewport clamping, and eight resize handles (n/e/s/w plus four corners) enforcing a `340×280` minimum with edge-aware repositioning.
  - Opacity slider (15–100%), backdrop-blur slider (0–24px), font-size selector (small/medium/large/xlarge), and theme palette (acrylic/midnight/obsidian/cyan).
  - Pin/always-on-top toggle, minimize-to-floating-pill, and maximize/restore.
  - Karaoke/Full-Sheet segmented view switcher, auto-scroll toggle, and Genius annotations drawer toggle.
- ✅ `src/components/KaraokeLyricsView.tsx` — active-line detection using `currentTimeMs + syncOffsetMs`, smooth auto-scroll centering, click-to-seek per line, section tags, annotation flag buttons, and a loading/empty state.
- ✅ `src/components/FullSheetLyricsView.tsx` — editorial sheet layout with verse headers, in-sheet search with match highlighting, copy-sheet-to-clipboard, click-to-seek with per-line timestamps, and font sizing.
- ✅ `src/components/GeniusAnnotationsPanel.tsx` — selected-annotation spotlight (line ref, header, body, `verifiedBy`, votes), full annotations list, behind-the-lyrics trivia, and track credits.
- ✅ `src/components/BackgroundDesktop.tsx` — mock Amazon Music desktop canvas (plus studio/minimal backdrop themes) that reveals the glass translucency, four layout `PRESETS` (default/compact/sidebar/stage), and a backdrop-theme switcher.
- ✅ `src/App.tsx` + `src/types/lyrics.ts` — centralized `windowState`, `handleUpdateWindowState`, `handleApplyPreset` wiring, and domain types (`WindowState`, `WindowPreset`, `ViewMode`, `WindowTheme`, `FontSize`).

**Out of scope for this phase:** playback sync via media-session detection and `±0.5s` / `±0.1s` offset calibration (Phase 4 — the karaoke view only *consumes* the `syncOffsetMs` prop), the pluggable AI adapter (Phase 5), and the native companion bridge (Phase 6) — none may be introduced here per `00_AI-SAFE.md`.

## 3. Tasks and Responsibilities

### 3.1 Documentation & Delivery

| Task | Responsibility |
| :--- | :--- |
| Verify the glass window drags smoothly from the title bar and is clamped within the viewport. | Delivery & Quality |
| Verify multi-direction resize (edges + corners) works and enforces the minimum size. | Delivery & Quality |
| Verify opacity (15–100%), blur (0–24px), theme, and font-size controls apply live. | Delivery |
| Verify pin/always-on-top, minimize-to-floating-pill, maximize/restore, and layout presets behave correctly. | Delivery |
| Verify the karaoke view highlights the active line, auto-scrolls it to center, supports click-to-seek, and surfaces annotation flags. | Delivery & Quality |
| Verify the full-sheet view renders verse headers, font sizing, in-sheet search highlighting, and copy-to-clipboard. | Delivery |
| Verify the Genius annotations drawer opens from the window and shows spotlight, list, trivia, and credits. | Delivery |
| Confirm the mock desktop canvas shows through the translucent glass across backdrop themes. | Delivery |
| Keep `specs/PROJECT_OVERVIEW.MD`, `specs/PROMPTS.md`, and this spec consistent with the implemented state. | Documentation |

### 3.2 Quality & Code Safety

| Task | Responsibility |
| :--- | :--- |
| Do not implement Phase 4–6 features (media-session playback sync / offset calibration, AI adapter, native companion bridge). | Code Safety (per `00_AI-SAFE.md`) |
| Do not add unnecessary dependencies. | Quality |
| Keep typecheck/lint clean (`npm run lint`). | Quality |
| Do not commit secrets; `.env*` remains ignored, referenced only via `.env.example`. | Code Safety |

## 4. Definition of Done

- [x] The glass window is draggable from the title bar and clamped within the viewport (`src/components/FloatingLyricsWindow.tsx`).
- [x] Multi-direction resize (n/e/s/w + four corners) is implemented with a `340×280` minimum size.
- [x] Opacity (15–100%) and backdrop-blur (0–24px) sliders apply live to the glass window.
- [x] Theme palette and font-size selector are wired to the window state.
- [x] Pin/always-on-top, minimize-to-floating-pill, and maximize/restore are implemented.
- [x] Layout presets (default/compact/sidebar/stage) are provided and applied via `handleApplyPreset`.
- [x] Karaoke mode highlights the active line, auto-scrolls to center, and supports click-to-seek and annotation flags.
- [x] Full-sheet mode renders verse headers, font sizing, in-sheet search highlighting, and copy-to-clipboard.
- [x] The Genius annotations drawer shows the annotation spotlight, full list, trivia, and track credits.
- [x] The mock desktop canvas (`BackgroundDesktop.tsx`) shows through the translucent glass.
- [x] `npm run lint` (`tsc --noEmit`) passes with no errors.
- [x] No Phase 4–6 features were introduced during this phase.
