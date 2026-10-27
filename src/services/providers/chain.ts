import { Song } from '../../types/lyrics';
import { debugLog } from '../debugConsole';
import { LookupOutcome } from '../lookupOutcome';
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

/** Pause before the single re-run that follows a transient provider failure. */
export const TRANSIENT_RETRY_DELAY_MS = 300;

export interface ChainResult {
  result: LyricsProviderResult | null;
  usedIndex: number;
  exhausted: boolean;
  /** Aggregated outcome of the chain (spec 17, W3). */
  outcome: LookupOutcome;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the ordered provider chain starting at `startIndex`, isolating each
 * provider so an offline, blocked, or unmatched provider degrades to the next
 * without blocking playback.
 *
 * Synchronized results are preferred (they drive Karaoke); the first plain-only
 * result is retained as a fallback and used only when no provider supplies
 * synchronized timing (plain-only results render as the Full Sheet).
 *
 * When a provider fails transiently (HTTP 5xx, a timeout) the whole chain is
 * run once more before the request ends, and the aggregated outcome is
 * `transient-error` so the UI can offer a Retry instead of claiming the song
 * has no lyrics.
 */
export async function runProviderChain(
  song: Song,
  startIndex = 0,
  providers: ProviderFn[] = PROVIDERS,
  timeouts: number[] = DEFAULT_TIMEOUTS,
  signal?: AbortSignal
): Promise<ChainResult> {
  const first = await runChainPass(song, startIndex, providers, timeouts, signal);

  if (first.outcome !== 'transient-error' || first.result) {
    return first;
  }

  debugLog('lookup', 'chain.retry-after-transient', {
    key: `${song.title}|${song.artist}`,
    delayMs: TRANSIENT_RETRY_DELAY_MS,
  });

  await sleep(TRANSIENT_RETRY_DELAY_MS);

  if (signal?.aborted) return first;

  const second = await runChainPass(song, startIndex, providers, timeouts, signal);
  if (second.result) return second;

  // The re-run did not recover the track; keep the honest classification.
  return {
    ...second,
    outcome: second.outcome === 'transient-error' ? 'transient-error' : second.outcome,
  };
}

async function runChainPass(
  song: Song,
  startIndex: number,
  providers: ProviderFn[],
  timeouts: number[],
  signal?: AbortSignal
): Promise<ChainResult> {
  const limit = providers.length;
  const from = Math.max(0, Math.min(startIndex, limit));
  const key = `${song.title}|${song.artist}`;

  let plainFallback: { result: LyricsProviderResult; index: number } | null = null;
  let sawTransient = false;
  let sawGateRejection = false;

  debugLog('lookup', 'chain.start', { key, from, providers: limit });

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
      debugLog('provider', 'chain.attempt', {
        key,
        provider: name,
        outcome,
        reported: res.outcome,
        ms: Date.now() - startedAt,
      });
      if (res.outcome === 'transient-error') sawTransient = true;
      if (res.outcome === 'gate-rejected') sawGateRejection = true;
      if (res.syncedLyrics && res.syncedLyrics.length > 0) {
        debugLog('lookup', 'chain.result', { key, provider: name, outcome: 'synced' });
        return { result: res, usedIndex: i, exhausted: false, outcome: 'found' };
      }
      if (!plainFallback && res.plainLyrics && res.plainLyrics.trim().length > 0) {
        plainFallback = { result: res, index: i };
      }
    } catch (error) {
      // isolate provider errors and continue down the chain
      sawTransient = true;
      debugLog(
        'provider',
        'chain.attempt',
        {
          key,
          provider: name,
          outcome: 'error',
          error: error instanceof Error ? error.message : String(error),
          ms: Date.now() - startedAt,
        },
        'error'
      );
    }
  }

  if (plainFallback) {
    debugLog('lookup', 'chain.result', {
      key,
      provider: PROVIDER_NAMES[plainFallback.index] ?? 'unknown',
      outcome: 'plain-fallback',
    });
    return {
      result: plainFallback.result,
      usedIndex: plainFallback.index,
      exhausted: false,
      outcome: 'found',
    };
  }

  const outcome: LookupOutcome = sawTransient
    ? 'transient-error'
    : sawGateRejection
      ? 'gate-rejected'
      : 'not-found';

  debugLog('lookup', 'chain.result', { key, outcome }, outcome === 'not-found' ? 'warn' : 'error');
  return { result: null, usedIndex: Math.max(0, limit - 1), exhausted: true, outcome };
}
