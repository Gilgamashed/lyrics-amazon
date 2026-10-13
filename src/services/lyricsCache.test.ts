import { afterEach, describe, expect, it, vi } from 'vitest';
import { LyricsData, Song } from '../types/lyrics';
import {
  clearLyricsCache,
  getCachedLyrics,
  getCacheStats,
  setCachedLyrics,
} from './lyricsCache';

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
  });

  it('round-trips a payload keyed case/space-insensitively by title|artist', () => {
    setCachedLyrics(makeSong('Smooth Operator', 'Sade'), makeData('Smooth Operator'));

    expect(getCachedLyrics(makeSong('smooth operator', ' SADE '))).not.toBeNull();
    expect(getCachedLyrics(makeSong('smooth operator', 'Sade'))).not.toBeNull();
    // Different artist misses.
    expect(getCachedLyrics(makeSong('smooth operator', 'Other'))).toBeNull();
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
  });
});