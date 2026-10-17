import { Song } from '../../types/lyrics';
import { devLog } from '../devLog';
import { fetchGenius } from './genius';
import { fetchLrcLib } from './lrclib';
import { fetchLyrica } from './lyrica';
import { LyricsProviderResult } from './types';

export type ProviderFn = (
  song: Song,
  timeoutMs: number,
  signal?: AbortSignal
) => Promise<LyricsProviderResult>;

/**
 * Synced-first order: LRCLIB and Lyrica both host native time-synced lyrics, so
 * they are tried before Genius, which returns plain-only text by design and has
 * the heaviest page scrape. Lyrica gets a longer timeout because its free
 * public deployment can cold-start slowly.
 */
export const DEFAULT_PROVIDER_ORDER = ['LRCLIB', 'Lyrica', 'Genius'] as const;

const PROVIDERS: ProviderFn[] = [fetchLrcLib, fetchLyrica, fetchGenius];

const PROVIDER_NAMES = DEFAULT_PROVIDER_ORDER;

const DEFAULT_TIMEOUTS = [4000, 12000, 4000];

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
  timeouts: number[] = DEFAULT_TIMEOUTS,
  signal?: AbortSignal
): Promise<ChainResult> {
  const limit = providers.length;
  const from = Math.max(0, Math.min(startIndex, limit));
  const key = `${song.title}|${song.artist}`;

  let plainFallback: { result: LyricsProviderResult; index: number } | null = null;

  for (let i = from; i < limit; i++) {
    const fn = providers[i];
    const name = PROVIDER_NAMES[i] ?? `provider-${i}`;
    const startedAt = Date.now();
    try {
      const res = await fn(song, timeouts[i] ?? 3500, signal);
      const outcome = res.syncedLyrics?.length
        ? 'synced'
        : res.plainLyrics && res.plainLyrics.trim().length > 0
          ? 'plain'
          : 'empty';
      devLog('provider-attempt', { key, provider: name, outcome, ms: Date.now() - startedAt });
      if (res.syncedLyrics && res.syncedLyrics.length > 0) {
        return { result: res, usedIndex: i, exhausted: false };
      }
      if (!plainFallback && res.plainLyrics && res.plainLyrics.trim().length > 0) {
        plainFallback = { result: res, index: i };
      }
    } catch {
      // isolate provider errors and continue down the chain
      devLog('provider-attempt', {
        key,
        provider: name,
        outcome: 'error',
        ms: Date.now() - startedAt,
      });
    }
  }

  if (plainFallback) {
    return { result: plainFallback.result, usedIndex: plainFallback.index, exhausted: false };
  }

  return { result: null, usedIndex: Math.max(0, limit - 1), exhausted: true };
}
