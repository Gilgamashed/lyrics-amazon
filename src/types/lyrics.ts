export interface LyricLine {
  id: string;
  startTimeMs: number;
  endTimeMs?: number;
  text: string;
  section?: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'instrumental';
  annotationId?: string;
}

export interface GeniusAnnotation {
  id: string;
  lineRef: string;
  header: string;
  content: string;
  verifiedBy?: string;
  votes?: number;
  sourceUrl?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  durationMs: number;
  amazonMusicUrl?: string;
  year?: string;
  genre?: string;
  isExplicit?: boolean;
  /** True when the player did not report a usable title (spec 17, W2). */
  titleMissing?: boolean;
  /**
   * The original combined `"Artist - Title"` blob this identity was split
   * from, when it was (spec 17, W4). Lets the lookup try the reversed
   * pairing as well.
   */
  splitFrom?: string;
}

export interface LyricsData {
  songId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  syncedLyrics: LyricLine[];
  plainLyrics: string;
  provider:
    | 'Genius'
    | 'LRCLIB'
    | 'Lyrica'
    | 'AI Sync'
    | 'Amazon Music'
    | 'None';
  annotations: GeniusAnnotation[];
  trivia: string[];
  trackInfo?: {
    writers: string[];
    producers: string[];
    releaseDate: string;
  };
}

export type ViewMode = 'karaoke' | 'sheet';
export type WindowTheme = 'acrylic' | 'midnight' | 'obsidian' | 'cyan';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type BackgroundTheme = 'amazon-music' | 'studio' | 'minimal';
export type LayoutPresetId = 'compact' | 'standard' | 'wide';

/**
 * Appearance of the docked lyrics surface. The former floating-window geometry
 * (x/y/width/height/pin/minimize/maximize) was removed in the UX redesign.
 */
export interface WindowState {
  opacity: number;
  blur: number;
  viewMode: ViewMode;
  theme: WindowTheme;
  fontSize: FontSize;
  autoScroll: boolean;
}

/**
 * Width/density presets for the docked lyrics surface (the floating window's
 * former "window layout presets", re-purposed after docking).
 */
export interface LayoutPreset {
  id: LayoutPresetId;
  name: string;
  description: string;
  width: number;
}

/** Durable, user-configurable application settings (persisted locally). */
export interface AppSettings {
  window: WindowState;
  backgroundTheme: BackgroundTheme;
  layoutPreset: LayoutPresetId;
  syncOffsetMs: number;
}

export interface AIConfig {
  providerUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

export type DetectionSource = 'browser' | 'desktop';

export type FeedbackState = 'none' | 'up' | 'down';

/** Progress of the user-triggered AI karaoke pipeline. */
export type KaraokeAIStatus =
  | 'idle'
  | 'capturing'
  | 'aligning'
  | 'saving'
  | 'done'
  | 'error';

export interface NowPlaying {
  source: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  durationMs: number | null;
  positionMs: number | null;
  isPlaying: boolean;
  appId: string | null;
  isAmazon: boolean;
  albumArt: string | null;
}
