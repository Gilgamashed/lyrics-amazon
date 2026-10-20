import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LyricsData, Song } from '../types/lyrics';
import {
  clearSavedAILyrics,
  getSavedAILyrics,
  getSavedAILyricsStats,
  saveAILyrics,
} from './aiLyricsStore';

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

describe('aiLyricsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('only persists provider === "AI Sync" payloads', () => {
    saveAILyrics(makeSong('Synced'), makeData('Synced', 'AI Sync'));
    saveAILyrics(makeSong('Genius'), makeData('Genius', 'Genius'));
    saveAILyrics(makeSong('LRCLIB'), makeData('LRCLIB', 'LRCLIB'));

    expect(getSavedAILyrics(makeSong('Synced'))).not.toBeNull();
    expect(getSavedAILyrics(makeSong('Genius'))).toBeNull();
    expect(getSavedAILyrics(makeSong('LRCLIB'))).toBeNull();
    expect(getSavedAILyricsStats().count).toBe(1);
  });

  it('round-trips and keys by sanitized title|artist', () => {
    saveAILyrics(makeSong('  Big Lots ', '  Artist  '), makeData('Big Lots', 'AI Sync'));
    expect(getSavedAILyrics(makeSong('big lots', 'artist'))).not.toBeNull();
    expect(getSavedAILyrics(makeSong('big lots', 'someone else'))).toBeNull();
  });

  it('keeps multiple songs segregated', () => {
    saveAILyrics(makeSong('One'), makeData('One', 'AI Sync'));
    saveAILyrics(makeSong('Two'), makeData('Two', 'AI Sync'));
    expect(getSavedAILyricsStats().count).toBe(2);
    expect(getSavedAILyrics(makeSong('One'))?.title).toBe('One');
    expect(getSavedAILyrics(makeSong('Two'))?.title).toBe('Two');
  });

  it('maps decorated and clean readings to one normalized identity', () => {
    saveAILyrics(
      makeSong('Big Lots (Remastered 2011)', 'Artist'),
      makeData('Big Lots', 'AI Sync')
    );
    expect(getSavedAILyrics(makeSong('Big Lots', 'Artist'))).not.toBeNull();
    expect(getSavedAILyrics(makeSong('Big Lots [Explicit]', 'Artist'))).not.toBeNull();
  });

  it('dual-reads and lazily migrates legacy raw-key entries', () => {
    const legacyKey = 'big lots (remastered 2011)|artist';
    localStorage.setItem(
      'lyrics-amazon:ai-lyrics:v1',
      JSON.stringify({ [legacyKey]: makeData('Big Lots', 'AI Sync') })
    );

    // The normalized lookup uses the decorated reading's legacy key as fallback.
    expect(
      getSavedAILyrics(makeSong('Big Lots (Remastered 2011)', 'Artist'))
    ).not.toBeNull();
    // Subsequent clean lookups hit the migrated normalized entry.
    expect(getSavedAILyrics(makeSong('Big Lots', 'Artist'))).not.toBeNull();
    const stored = JSON.parse(localStorage.getItem('lyrics-amazon:ai-lyrics:v1') as string);
    expect(stored).toHaveProperty('big lots|artist');
    expect(stored).not.toHaveProperty(legacyKey);
  });

  it('writes through to the session cache', async () => {
    const { getCachedLyrics, clearLyricsCache } = await import('./lyricsCache');
    clearLyricsCache();
    saveAILyrics(makeSong('Cached Too'), makeData('Cached Too', 'AI Sync'));
    expect(getCachedLyrics(makeSong('Cached Too'))?.title).toBe('Cached Too');
    clearLyricsCache();
  });

  it('recovers from corrupt local storage', () => {
    localStorage.setItem('lyrics-amazon:ai-lyrics:v1', 'not-json{{{');
    expect(getSavedAILyrics(makeSong('One'))).toBeNull();

    saveAILyrics(makeSong('One'), makeData('One', 'AI Sync'));
    expect(getSavedAILyrics(makeSong('One'))).not.toBeNull();
  });

  it('treats non-object parsed values as an empty store', () => {
    localStorage.setItem('lyrics-amazon:ai-lyrics:v1', '"just a string"');
    expect(getSavedAILyricsStats().count).toBe(0);
  });

  it('clears the store', () => {
    saveAILyrics(makeSong('One'), makeData('One', 'AI Sync'));
    clearSavedAILyrics();
    expect(getSavedAILyrics(makeSong('One'))).toBeNull();
    expect(getSavedAILyricsStats().count).toBe(0);
  });

  it('is safe when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(getSavedAILyrics(makeSong('One'))).toBeNull();
    saveAILyrics(makeSong('One'), makeData('One', 'AI Sync'));
    expect(getSavedAILyricsStats().count).toBe(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});