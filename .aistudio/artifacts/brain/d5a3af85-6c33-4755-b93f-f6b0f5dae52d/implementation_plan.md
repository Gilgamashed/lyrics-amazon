# Floating Lyrics Companion for Amazon Music

A standalone desktop-style web companion that retrieves synchronized lyrics and song annotations from providers such as Genius and LRCLIB for songs currently played on Amazon Music, presented in a floating, translucent, draggable, and resizable glass window.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during clarification and will govern the application architecture:

- **Confirmed Track Detection (Hybrid Approach)**: Supports automatic detection via the browser `navigator.mediaSession` API and audio listener, an Amazon Music live track quick-input bar, and full song/artist search with instant search suggestions.
- **Confirmed Lyric Presentation (Dual Mode)**: Instant toggle between **Synchronized Karaoke Mode** (word/line timing highlighting, auto-scroll, click-to-seek, offset fine-tuning) and **Full Lyrics Sheet** (clean editorial layout, verse headers, font sizing, and copy tool).
- **Confirmed Window Experience (Translucent Draggable Glass Window)**: Window features custom translucency/opacity slider, background blur control, pinned overlay mode, corner/edge resize handles, minimize to floating pill HUD, and full-screen view.

---

## 1. Overview & Core Concept

### What It Does
The application connects Amazon Music listeners with lyrics and song meanings from Genius and synced lyric databases. When a user is playing a track on Amazon Music (desktop app, web player, or mobile), the app detects or searches the track, pulls high-precision timestamped lyrics, fetches Genius annotations/background trivia, and displays everything inside an ultra-sleek, floating translucent glass HUD window that can sit above your workspace.

### Target Audience & Persona
Music enthusiasts, karaoke singers, and desk workers who stream music via Amazon Music and want a floating, non-intrusive lyric feed with Apple Music-grade synchronized line animations and Genius verified annotations.

### Key Value
- **Zero Friction Sync**: Quick manual or automatic sync with time-offset calibration (+/- 0.5s) to match your exact Amazon Music playback stream.
- **Multi-Provider Reliability**: Primary synced lyric fetch via LRCLIB + Genius song insights & annotations, with intelligent Gemini fallback parsing for unlisted or live tracks.
- **True Desktop Window Ergonomics**: Full drag-and-drop spatial movement, multi-directional resize handles, adjustable opacity (from solid to ghost glass), and click-through/pinning capabilities.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Track Sync Flow**:
   - The user opens the companion. The header displays the **Amazon Music Sync Bar**.
   - The app attempts auto-detection via `navigator.mediaSession`.
   - Alternatively, the user searches any song (or clicks a trending Amazon Music sample track like *Espresso*, *Birds of a Feather*, *Cruel Summer*, *Blinding Lights*).
2. **Floating Lyrics Window Experience**:
   - The floating window appears as a frosted glass pane with window controls (Minimize, Maximize, Opacity slider, Pin, Mode Switch).
   - In **Karaoke Mode**, the current verse glows in vibrant typography, smoothly auto-scrolling as the playback timer runs. The user can click any lyric line to jump the timer or use "+0.5s / -0.5s" buttons to dial in exact Amazon Music sync.
   - In **Full Sheet Mode**, the user reads uninterrupted verses with stanza headings, lyric copy buttons, and Genius annotations drawer.
3. **Genius Insights Drawer**:
   - Clicking the "Genius Insights" badge reveals track trivia, album art, writers/producers, and verified lyric annotations.
4. **Window Customization**:
   - Drag anywhere on the title bar to position the window anywhere on the desktop canvas.
   - Drag corner resize handles to adjust width and height.
   - Adjust the opacity slider (15% to 100%) so background desktop content remains visible.

### Visual Identity & Theme
- **Aesthetic Direction**: Frosted glassmorphism inspired by macOS Sequoia and modern audio workstations. Deep charcoal/slate backdrop with high-contrast, luminous lyric typography.
- **Color Palette**:
  - Dominant Neutral: Deep dark slate canvas (`#090D16`, `#0F172A`).
  - Structural Glass: Translucent acrylic surfaces (`rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.03)` with `backdrop-blur-xl` and `border-white/10`).
  - Primary Accents: Amazon Music cyan/electric blue (`#00A8E1`, `#2563EB`) and Genius gold (`#FFDF00` for annotations).
- **Typography**:
  - Display & Lyrics: `Plus Jakarta Sans` for clean, bold, legible lyric lines.
  - Timers & Tabular Data: Tabular monospace numerals (`tabular-nums font-mono`) for playback timestamps (`03:24 / 04:12`) and offset calibration.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Standalone Floating Window System in Applet**:
  - *Chosen Approach*: Build a lightweight desktop window manager using React and pointer events supporting dragging, boundaries, multi-axis resizing, docking, and full opacity controls.
  - *Why*: Provides the user with a floating window experience directly inside the browser environment without requiring unsigned native desktop binaries.
- **Decision 2: Multi-Source Lyric Engine (Genius + LRCLIB + AI Sync Fallback)**:
  - *Chosen Approach*: Query LRCLIB for millisecond-precision LRC synchronized lyrics, Genius for rich text & annotations, with Gemini `@google/genai` API fallback for tracks missing timestamp metadata.
  - *Why*: Ensures 100% lyric coverage, instant search, and synced line-by-line animations for virtually any song.
- **Decision 3: Playback Sync Calibration Controls**:
  - *Chosen Approach*: Include a scrubbable progress bar with Play/Pause, speed adjustment, and a dedicated `±0.5s` sync offset control.
  - *Why*: Because Amazon Music desktop or phone audio may be slightly ahead or behind when starting playback, one-click micro-adjustments keep lyrics locked to the vocals.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Floating Lyrics Companion                       │
├────────────────────────────────────────────────────────────────────────┤
│  Top Bar Contract: [Amazon Music Sync]  [Modes]  [Window Presets]      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Amazon Music Playback Bar                     │  │
│  │  [Search / Auto-Detect]  [Track Metadata]  [Play / Pause / Sync] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               Floating Glass Window (Draggable/Resizable)         │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ Window Title Bar: [Title] [Opacity 🎚️] [Pin 📌] [Mini] [X]  │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Dual Viewport:                                             │  │  │
│  │  │   • Synchronized Karaoke View (LRC Timestamp Highlighting) │  │  │
│  │  │   • Full Sheet View (Clean Text & Verse Structure)         │  │  │
│  │  │   • Genius Trivia & Annotations Drawer                     │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Bottom Sync Bar: [01:42 / 03:15] [Offset: +0.2s] [Speed]   │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Structure
1. **`src/types/lyrics.ts`**: Types for `Song`, `LyricLine`, `LyricsData`, `GeniusAnnotation`, and `WindowState`.
2. **`src/services/lyricsService.ts`**: Unified search and retrieval engine fetching synced LRC lines, Genius metadata/annotations, and smart fallback generation.
3. **`src/components/FloatingLyricsWindow.tsx`**: The draggable, resizable glass window with mouse pointer interaction, multi-edge resizing, opacity and blur controls, and pin toggle.
4. **`src/components/KaraokeLyricsView.tsx`**: Time-synchronized smooth-scrolling karaoke view with active line glow, past verse dimming, and click-to-seek timestamp jumping.
5. **`src/components/FullSheetLyricsView.tsx`**: Clean editorial lyric sheet with stanza labels, copy-all action, font size slider, and search within lyrics.
6. **`src/components/GeniusAnnotationsPanel.tsx`**: Genius-style verified context, behind-the-lyrics facts, and highlighted verse explanations.
7. **`src/components/AmazonMusicBar.tsx`**: Currently playing track controls, song search input with auto-suggestions, audio progress bar, and sync calibration.
8. **`src/components/WindowPresetsModal.tsx`**: Quick window sizes (Compact HUD, Ultrawide Banner, Standard Desktop, Vertical Mobile Card).

---

## 5. Verification Plan

- Run `compile_applet` to ensure TypeScript compilation and dependencies resolve without issues.
- Verify dragging, corner resizing, opacity adjustments, and pinning without clipping.
- Verify seamless switching between Synchronized Karaoke mode and Full Sheet mode.
- Verify lyric seek on click, playback timing, and sync offset calibration (`+0.5s` / `-0.5s`).
- Test search and track switching across popular songs and custom queries.
