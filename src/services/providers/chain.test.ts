import { describe, expect, it } from 'vitest';
import { Song } from '../../types/lyrics';
import { runProviderChain, ProviderFn, DEFAULT_PROVIDER_ORDER, PROVIDER_COUNT } from './chain';
import { LyricsProviderResult } from './types';

const SONG: Song = {
  id: 's-1',
  title: 'Track',
  artist: 'Artist',
  album: 'Album',
  albumArt: '',
  durationMs: 180_000,
};

function synced(provider: LyricsProviderResult['provider']): LyricsProviderResult {
  return {
    provider,
    hasSync: true,
    syncedLyrics: [{ id: 'l0', startTimeMs: 0, text: 'line' }],
    plainLyrics: 'line',
  };
}

function plain(provider: LyricsProviderResult['provider']): LyricsProviderResult {
  return { provider, hasSync: false, plainLyrics: 'plain line' };
}

function notFound(provider: LyricsProviderResult['provider']): LyricsProviderResult {
  return { provider, hasSync: false };
}

function rejecting(provider: LyricsProviderResult['provider']): ProviderFn {
  return async () => {
    throw new Error(`${provider} offline`);
  };
}

describe('runProviderChain', () => {
  it('exposes a synced-first provider order (LRCLIB → Lyrica → Genius)', () => {
    expect([...DEFAULT_PROVIDER_ORDER]).toEqual(['LRCLIB', 'Lyrica', 'Genius']);
    expect(PROVIDER_COUNT).toBe(3);
  });

  it('returns the first synchronized result in order', async () => {
    const providers: ProviderFn[] = [
      async () => synced('Genius'),
      async () => synced('LRCLIB'),
    ];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.result?.provider).toBe('Genius');
    expect(result.usedIndex).toBe(0);
    expect(result.exhausted).toBe(false);
  });

  it('prefers a later synchronized result over an earlier plain-only result', async () => {
    const providers: ProviderFn[] = [
      async () => plain('LRCLIB'),
      async () => synced('Lyrica'),
      async () => plain('Genius'),
    ];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.result?.provider).toBe('Lyrica');
    expect(result.usedIndex).toBe(1);
  });

  it('falls back to the first plain-only result when no sync is available', async () => {
    const providers: ProviderFn[] = [
      async () => notFound('Genius'),
      async () => plain('LRCLIB'),
      async () => plain('None'),
    ];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.result?.provider).toBe('LRCLIB');
    expect(result.usedIndex).toBe(1);
    expect(result.exhausted).toBe(false);
  });

  it('isolates provider errors and advances to the next source', async () => {
    const providers: ProviderFn[] = [
      rejecting('Genius'),
      async () => synced('LRCLIB'),
    ];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.result?.provider).toBe('LRCLIB');
    expect(result.usedIndex).toBe(1);
  });

  it('reports exhaustion when every provider misses', async () => {
    const providers: ProviderFn[] = [
      async () => notFound('Genius'),
      rejecting('LRCLIB'),
      async () => notFound('None'),
    ];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.result).toBeNull();
    expect(result.exhausted).toBe(true);
  });

  it('starts from the given index for thumbs-down advancement', async () => {
    const providers: ProviderFn[] = [
      async () => synced('Genius'),
      async () => synced('LRCLIB'),
      async () => synced('None'),
    ];
    const result = await runProviderChain(SONG, 2, providers);
    expect(result.result?.provider).toBe('None');
    expect(result.usedIndex).toBe(2);
  });

  it('clamps an out-of-range start index to the chain end', async () => {
    const providers: ProviderFn[] = [async () => synced('Genius')];
    const result = await runProviderChain(SONG, 5, providers);
    expect(result.result).toBeNull();
    expect(result.exhausted).toBe(true);
  });
});
