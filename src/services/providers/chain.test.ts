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

// Spec 17, W3: the chain classifies its outcome, and a transient failure is
// retried once instead of ending the request.
describe('runProviderChain outcome classification (spec 17, W3)', () => {
  it('reports "found" with a synced result', async () => {
    const providers: ProviderFn[] = [async () => synced('LRCLIB')];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('found');
  });

  it('reports "found" when a plain-only result is used as the fallback', async () => {
    const providers: ProviderFn[] = [async () => plain('LRCLIB')];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('found');
    expect(result.result?.plainLyrics).toBe('plain line');
  });

  it('reports "not-found" when every provider answered without a match', async () => {
    const providers: ProviderFn[] = [
      async () => ({ ...notFound('LRCLIB'), outcome: 'not-found' }),
      async () => ({ ...notFound('Lyrica'), outcome: 'not-found' }),
    ];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('not-found');
    expect(result.result).toBeNull();
  });

  it('reports "gate-rejected" when every candidate failed the identity gate', async () => {
    const providers: ProviderFn[] = [
      async () => ({ ...notFound('LRCLIB'), outcome: 'gate-rejected' }),
    ];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('gate-rejected');
  });

  it('reports "transient-error" when the only provider failed transiently', async () => {
    const providers: ProviderFn[] = [
      async () => ({ ...notFound('LRCLIB'), outcome: 'transient-error' }),
    ];
    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('transient-error');
  }, 20_000);

  it('re-runs the chain once after a transient failure and returns the recovered result', async () => {
    let calls = 0;
    const providers: ProviderFn[] = [
      async () => {
        calls += 1;
        return calls === 1
          ? { ...notFound('LRCLIB'), outcome: 'transient-error' }
          : synced('LRCLIB');
      },
    ];

    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('found');
    expect(result.result?.provider).toBe('LRCLIB');
    expect(calls).toBe(2);
  }, 20_000);

  it('re-runs the chain only once, even when the second pass also fails', async () => {
    let calls = 0;
    const providers: ProviderFn[] = [
      async () => {
        calls += 1;
        return { ...notFound('LRCLIB'), outcome: 'transient-error' };
      },
    ];

    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('transient-error');
    expect(calls).toBe(2);
  }, 20_000);

  it('does not re-run the chain when a provider already produced a result', async () => {
    let calls = 0;
    const providers: ProviderFn[] = [
      async () => {
        calls += 1;
        return synced('LRCLIB');
      },
    ];

    await runProviderChain(SONG, 0, providers);
    expect(calls).toBe(1);
  });

  it('does not re-run the chain after a clean miss', async () => {
    let calls = 0;
    const providers: ProviderFn[] = [
      async () => {
        calls += 1;
        return { ...notFound('LRCLIB'), outcome: 'not-found' };
      },
    ];

    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('not-found');
    expect(calls).toBe(1);
  });

  it('keeps the transient verdict when the re-run finds nothing at all', async () => {
    let calls = 0;
    const providers: ProviderFn[] = [
      async () => {
        calls += 1;
        return calls === 1
          ? { ...notFound('LRCLIB'), outcome: 'transient-error' }
          : { ...notFound('LRCLIB'), outcome: 'not-found' };
      },
    ];

    const result = await runProviderChain(SONG, 0, providers);
    expect(result.outcome).toBe('not-found');
    expect(calls).toBe(2);
  }, 20_000);
});
