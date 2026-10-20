import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LyricsData, Song } from '../types/lyrics';
import {
  clearAcceptedLyrics,
  clearAllAcceptedLyrics,
  getAcceptedLyrics,
  getAcceptedLyricsStats,
  saveAcceptedLyrics,
} from './userLyricsStore';

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

function makeData(title: string, provider: LyricsData['provider']): LyricsData {
  return {
    songId: `s-${title}`,
    title,
    artist: 'Artist',
    album: '',
    albumArt: '',
    provider,
    syncedLyrics: [],
    plainLyrics: '',
    annotations: [],
    trivia: [],
  };
}

describe('userLyricsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists accepted results for any provider', () => {
    saveAcceptedLyrics(makeSong('Genius'), makeData('Genius', 'Genius'));
    saveAcceptedLyrics(makeSong('LRCLIB'), makeData('LRCLIB', 'LRCLIB'));
    saveAcceptedLyrics(makeSong('AI'), makeData('AI', 'AI Sync'));

    expect(getAcceptedLyrics(makeSong('Genius'))?.provider).toBe('Genius');
    expect(getAcceptedLyrics(makeSong('LRCLIB'))?.provider).toBe('LRCLIB');
    expect(getAcceptedLyrics(makeSong('AI'))?.provider).toBe('AI Sync');
    expect(getAcceptedLyricsStats().count).toBe(3);
  });

  it('is song-scoped and keyed by sanitized title|artist', () => {
    saveAcceptedLyrics(makeSong('  Big Lots ', '  Artist  '), makeData('Big Lots', 'Genius'));
    expect(getAcceptedLyrics(makeSong('big lots', 'artist'))).not.toBeNull();
    expect(getAcceptedLyrics(makeSong('big lots', 'someone else'))).toBeNull();
  });

  it('round-trips across a simulated restart (fresh read from storage)', () => {
    saveAcceptedLyrics(makeSong('Persisted'), makeData('Persisted', 'LRCLIB'));
    const raw = localStorage.getItem('lyrics-amazon:user-accepted-lyrics:v1');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toHaveProperty('persisted|artist');
    expect(getAcceptedLyrics(makeSong('Persisted'))?.title).toBe('Persisted');
  });

  it('maps decorated and clean readings to one normalized identity', () => {
    saveAcceptedLyrics(
      makeSong('Big Lots (Remastered 2011)', 'Artist'),
      makeData('Big Lots', 'Genius')
    );
    expect(getAcceptedLyrics(makeSong('Big Lots', 'Artist'))).not.toBeNull();
    expect(getAcceptedLyrics(makeSong('Big Lots [Explicit]', 'Artist'))).not.toBeNull();
  });

  it('dual-reads and lazily migrates legacy raw-key entries', () => {
    const legacyKey = 'big lots (remastered 2011)|artist';
    localStorage.setItem(
      'lyrics-amazon:user-accepted-lyrics:v1',
      JSON.stringify({ [legacyKey]: makeData('Big Lots', 'Genius') })
    );

    // The normalized lookup uses the decorated reading's legacy key as fallback.
    expect(getAcceptedLyrics(makeSong('Big Lots (Remastered 2011)', 'Artist'))).not.toBeNull();
    // Subsequent clean lookups hit the migrated normalized entry.
    expect(getAcceptedLyrics(makeSong('Big Lots', 'Artist'))).not.toBeNull();
    // The read rewrote the entry under the normalized key and dropped the legacy one.
    const stored = JSON.parse(localStorage.getItem('lyrics-amazon:user-accepted-lyrics:v1') as string);
    expect(stored).toHaveProperty('big lots|artist');
    expect(stored).not.toHaveProperty(legacyKey);
  });

  it('writes through to the session cache', async () => {
    const { getCachedLyrics, clearLyricsCache } = await import('./lyricsCache');
    clearLyricsCache();
    saveAcceptedLyrics(makeSong('Cached Too'), makeData('Cached Too', 'Genius'));
    expect(getCachedLyrics(makeSong('Cached Too'))?.title).toBe('Cached Too');
    clearLyricsCache();
  });

  it('clears a single song and the whole store', () => {
    saveAcceptedLyrics(makeSong('One'), makeData('One', 'Genius'));
    saveAcceptedLyrics(makeSong('Two'), makeData('Two', 'LRCLIB'));

    clearAcceptedLyrics(makeSong('One'));
    expect(getAcceptedLyrics(makeSong('One'))).toBeNull();
    expect(getAcceptedLyrics(makeSong('Two'))).not.toBeNull();

    clearAllAcceptedLyrics();
    expect(getAcceptedLyricsStats().count).toBe(0);
  });

  it('recovers from corrupt local storage', () => {
    localStorage.setItem('lyrics-amazon:user-accepted-lyrics:v1', 'not-json{{{');
    expect(getAcceptedLyrics(makeSong('One'))).toBeNull();
  });

  it('is safe when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(getAcceptedLyrics(makeSong('One'))).toBeNull();
    saveAcceptedLyrics(makeSong('One'), makeData('One', 'Genius'));
    expect(getAcceptedLyricsStats().count).toBe(0);
  });
});
