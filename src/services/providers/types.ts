import { LyricLine, LyricsData } from '../../types/lyrics';
import { LookupOutcome } from '../lookupOutcome';

export interface LyricsProviderResult {
  syncedLyrics?: LyricLine[];
  plainLyrics?: string;
  hasSync: boolean;
  provider: LyricsData['provider'];
  /**
   * How the attempt ended (spec 17, W3). `transient-error` must never be
   * reported to the user as "lyrics not found".
   */
  outcome?: LookupOutcome;
}
