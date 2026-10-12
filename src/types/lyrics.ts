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
}

export interface LyricsData {
  songId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  syncedLyrics: LyricLine[];
  plainLyrics: string;
  provider: 'Genius' | 'LRCLIB' | 'Amazon Music' | 'AI Sync';
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

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  blur: number;
  isPinned: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  viewMode: ViewMode;
  theme: WindowTheme;
  fontSize: FontSize;
  autoScroll: boolean;
  showAnnotations: boolean;
}

export interface WindowPreset {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
}

export interface AIConfig {
  providerUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

export type DetectionSource = 'browser' | 'desktop';

export interface NowPlaying {
  source: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  durationMs: number | null;
  positionMs: number | null;
  isPlaying: boolean;
}
