import { Song } from '../../types/lyrics';
import { fetchGenius } from './genius';
import { fetchLrcLib } from './lrclib';
import { LyricsProviderResult } from './types';

export type ProviderFn = (song: Song, timeoutMs: number) => Promise<LyricsProviderResult>;

const PROVIDERS: ProviderFn[] = [fetchGenius, fetchLrcLib];

const DEFAULT_TIMEOUTS = [4000, 4000];

export const PROVIDER_COUNT = PROVIDERS.length;

export interface ChainResult {
  result: LyricsProviderResult | null;
  usedIndex: number;
  exhausted: boolean;
}

/**
 * Runs the ordered provider chain starting at `startIndex`, isolating each
 * provider so an offline, blocked, or unmatched provider degrades to the next
 * without blocking playback.
 *
 * Synchronized results are preferred (they drive Karaoke); the first plain-only
 * result is retained as a fallback and used only when no provider supplies
 * synchronized timing (plain-only results render as the Full Sheet).
 */
export async function runProviderChain(
  song: Song,
  startIndex = 0,
  providers: ProviderFn[] = PROVIDERS,
  timeouts: number[] = DEFAULT_TIMEOUTS
): Promise<ChainResult> {
  const limit = providers.length;
  const from = Math.max(0, Math.min(startIndex, limit));

  let plainFallback: { result: LyricsProviderResult; index: number } | null = null;

  for (let i = from; i < limit; i++) {
    const fn = providers[i];
    try {
      const res = await fn(song, timeouts[i] ?? 3500);
      if (res.syncedLyrics && res.syncedLyrics.length > 0) {
        return { result: res, usedIndex: i, exhausted: false };
      }
      if (!plainFallback && res.plainLyrics && res.plainLyrics.trim().length > 0) {
        plainFallback = { result: res, index: i };
      }
    } catch {
      // isolate provider errors and continue down the chain
    }
  }

  if (plainFallback) {
    return { result: plainFallback.result, usedIndex: plainFallback.index, exhausted: false };
  }

  return { result: null, usedIndex: Math.max(0, limit - 1), exhausted: true };
}
