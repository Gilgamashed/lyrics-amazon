import { afterEach, describe, expect, it, vi } from 'vitest';
import { LyricsData, Song } from '../types/lyrics';
import {
  clearLyricsCache,
  getCachedLyrics,
  getCacheStats,
  setCachedLyrics,
} from './lyricsCache';

const STORAGE_KEY = 'lyrics-amazon:lyrics-cache:v1';

function makeSong(title: string, artist: string = 'Artist'): Song {
  return {
    id: `s-${title}`,
    title,
    artist,
    album: '',
    albumArt: '',
    durationMs: 180_000,
  };
}

function makeData(title: string): LyricsData {
  return {
    songId: `s-${title}`,
    title,
    artist: 'Artist',
    album: '',
    albumArt: '',
    provider: 'AI Sync',
    syncedLyrics: [{ text: `${title} line`, startTimeMs: 0, id: `l-${title}` }],
    plainLyrics: `${title} line`,
    annotations: [],
    trivia: [],
  };
}

describe('lyricsCache', () => {
  afterEach(() => {
    clearLyricsCache();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('round-trips a payload keyed case/space-insensitively by title|artist', () => {
    setCachedLyrics(makeSong('Smooth Operator', 'Sade'), makeData('Smooth Operator'));

    expect(getCachedLyrics(makeSong('smooth operator', ' SADE '))).not.toBeNull();
    expect(getCachedLyrics(makeSong('smooth operator', 'Sade'))).not.toBeNull();
    // Different artist misses.
    expect(getCachedLyrics(makeSong('smooth operator', 'Other'))).toBeNull();
  });

  it('maps decorated and clean readings to one normalized identity', () => {
    setCachedLyrics(makeSong('Smooth Operator (Remastered 2011)', 'Sade'), makeData('Smooth Operator'));

    expect(getCachedLyrics(makeSong('Smooth Operator', 'Sade'))).not.toBeNull();
    expect(getCachedLyrics(makeSong('Smooth Operator [Explicit]', 'Sade'))).not.toBeNull();
  });

  it('slot-checks tunes sharing a title with different artists', () => {
    setCachedLyrics(makeSong('Same Name', 'Artist A'), makeData('Same Name'));
    expect(getCachedLyrics(makeSong('Same Name', 'Artist B'))).toBeNull();
    expect(getCachedLyrics(makeSong('Same Name', 'Artist A'))).not.toBeNull();
  });

  it('expires entries after the default ttl (7 days)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setCachedLyrics(makeSong('Old'), makeData('Old'));

    vi.setSystemTime(new Date('2026-01-08T00:01:00Z'));
    expect(getCachedLyrics(makeSong('Old'))).toBeNull();

    // Re-setting moves the timestamp forward.
    setCachedLyrics(makeSong('Old'), makeData('Old'));
    expect(getCachedLyrics(makeSong('Old'))).not.toBeNull();
  });

  it('evicts the least recently used entry when the cap is exceeded', () => {
    for (let i = 0; i < 20; i += 1) {
      setCachedLyrics(makeSong(`T${i}`), makeData(`T${i}`));
    }
    expect(getCacheStats().size).toBe(20);

    setCachedLyrics(makeSong('T20'), makeData('T20'));
    expect(getCacheStats().size).toBe(20);
    // Oldest untouched entry was evicted.
    expect(getCachedLyrics(makeSong('T0'))).toBeNull();
    expect(getCachedLyrics(makeSong('T1'))).not.toBeNull();
  });

  it('touching an entry protects it from eviction', () => {
    for (let i = 0; i < 20; i += 1) {
      setCachedLyrics(makeSong(`T${i}`), makeData(`T${i}`));
    }
    getCachedLyrics(makeSong('T0'));

    setCachedLyrics(makeSong('T20'), makeData('T20'));
    expect(getCachedLyrics(makeSong('T0'))).not.toBeNull();
    expect(getCachedLyrics(makeSong('T1'))).toBeNull();
  });

  it('tracks stats and clears', () => {
    setCachedLyrics(makeSong('A'), makeData('A'));
    setCachedLyrics(makeSong('B'), makeData('B'));
    expect(getCacheStats()).toEqual({ size: 2, maxEntries: 20 });

    clearLyricsCache();
    expect(getCacheStats()).toEqual({ size: 0, maxEntries: 20 });
    expect(getCachedLyrics(makeSong('A'))).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('mirrors writes into versioned local storage', () => {
    setCachedLyrics(makeSong('Persisted'), makeData('Persisted'));
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toHaveProperty('persisted|artist');
  });

  it('hydrates the bounded cache across a simulated restart', async () => {
    setCachedLyrics(makeSong('Survivor'), makeData('Survivor'));
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

    // Drop the in-memory state only (storage survives a real restart).
    vi.resetModules();
    const fresh = await import('./lyricsCache');
    expect(fresh.getCachedLyrics(makeSong('Survivor'))?.title).toBe('Survivor');
    expect(fresh.getCacheStats().size).toBe(1);
  });

  it('drops expired entries while hydrating', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'old|artist': { data: makeData('Old'), fetchedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 },
      })
    );

    vi.resetModules();
    const fresh = await import('./lyricsCache');
    expect(fresh.getCachedLyrics(makeSong('Old'))).toBeNull();
    expect(fresh.getCacheStats().size).toBe(0);
  });

  it('ignores corrupt persisted payloads', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    vi.resetModules();
    const fresh = await import('./lyricsCache');
    expect(fresh.getCacheStats().size).toBe(0);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bad: { fetchedAt: 'nope' } }));
    vi.resetModules();
    const second = await import('./lyricsCache');
    expect(second.getCacheStats().size).toBe(0);
  });

  it('is safe when storage is unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', undefined);
    try {
      const fresh = await import('./lyricsCache');
      expect(() => fresh.setCachedLyrics(makeSong('A'), makeData('A'))).not.toThrow();
      expect(fresh.getCachedLyrics(makeSong('A'))).not.toBeNull();
      expect(() => fresh.clearLyricsCache()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('treats a throwing localStorage access as unavailable', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      vi.resetModules();
      const fresh = await import('./lyricsCache');
      expect(fresh.getCacheStats().size).toBe(0);
      expect(() => fresh.setCachedLyrics(makeSong('A'), makeData('A'))).not.toThrow();
      expect(fresh.getCachedLyrics(makeSong('A'))).not.toBeNull();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });

  it('fails silently when a storage write throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setCachedLyrics(makeSong('A'), makeData('A'))).not.toThrow();
    expect(getCachedLyrics(makeSong('A'))).not.toBeNull();
    spy.mockRestore();
  });
});
