import { LyricLine, LyricsData } from '../../types/lyrics';

export interface LyricsProviderResult {
  syncedLyrics?: LyricLine[];
  plainLyrics?: string;
  hasSync: boolean;
  provider: LyricsData['provider'];
}
