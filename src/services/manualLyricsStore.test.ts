import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LyricsData, Song } from '../types/lyrics';
import {
  MAX_MANUAL_CHARS,
  MAX_MANUAL_LINES,
  buildManualLyrics,
  clearAllManualLyrics,
  clearManualLyrics,
  getManualLyrics,
  getManualLyricsStats,
  hasManualLyrics,
  saveManualLyrics,
  validateManualLyrics,
} from './manualLyricsStore';
import { clearLyricsCache, getCachedLyrics } from './lyricsCache';

const STORAGE_KEY = 'lyrics-amazon:manual-lyrics:v1';

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 's-1',
    title: 'Breed',
    artist: 'Nirvana',
    album: 'Nevermind',
    albumArt: '',
    durationMs: 180_000,
    ...overrides,
  };
}

function makeManual(text = 'First line\nSecond line'): LyricsData {
  return buildManualLyrics(makeSong(), text);
}

describe('manualLyricsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLyricsCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips a manual entry by normalized identity', () => {
    saveManualLyrics(makeSong(), makeManual());

    expect(getManualLyrics(makeSong())?.provider).toBe('Manual');
    expect(getManualLyrics(makeSong({ title: 'breed', artist: 'NIRVANA' }))).not.toBeNull();
    expect(getManualLyrics(makeSong({ artist: 'Other' }))).toBeNull();
  });

  it('maps decorated and clean readings onto one entry', () => {
    saveManualLyrics(makeSong(), makeManual());

    expect(getManualLyrics(makeSong({ title: 'Breed (Remastered 2011)' }))).not.toBeNull();
  });

  it('reports whether a manual entry exists', () => {
    expect(hasManualLyrics(makeSong())).toBe(false);
    saveManualLyrics(makeSong(), makeManual());
    expect(hasManualLyrics(makeSong())).toBe(true);
    expect(getManualLyricsStats().count).toBe(1);
  });

  it('writes through to the lyrics cache', () => {
    saveManualLyrics(makeSong(), makeManual());

    expect(getCachedLyrics(makeSong())?.provider).toBe('Manual');
  });

  it('clears one entry and reports whether anything was removed', () => {
    saveManualLyrics(makeSong(), makeManual());

    expect(clearManualLyrics(makeSong())).toBe(true);
    expect(getManualLyrics(makeSong())).toBeNull();
    expect(clearManualLyrics(makeSong())).toBe(false);
  });

  it('clears every manual entry', () => {
    saveManualLyrics(makeSong(), makeManual());
    saveManualLyrics(makeSong({ title: 'Other' }), makeManual());

    clearAllManualLyrics();
    expect(getManualLyricsStats().count).toBe(0);
  });

  it('migrates a legacy raw-key entry on read', () => {
    const punctuated = makeSong({ title: 'Hey, Ya!', artist: 'Outkast' });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'hey, ya!|outkast': { ...makeManual(), provider: 'Manual' } })
    );

    expect(getManualLyrics(punctuated)).not.toBeNull();
    // The legacy key is rewritten under the normalized identity.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(Object.keys(stored)).toEqual(['hey ya|outkast']);
    expect(stored['hey ya|outkast'].provider).toBe('Manual');
  });

  it('ignores a corrupt or non-object payload', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    expect(getManualLyrics(makeSong())).toBeNull();

    localStorage.setItem(STORAGE_KEY, '"just a string"');
    expect(getManualLyrics(makeSong())).toBeNull();

    localStorage.setItem(STORAGE_KEY, '[]');
    expect(getManualLyrics(makeSong())).toBeNull();
  });

  it('fails silently when the storage write throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => saveManualLyrics(makeSong(), makeManual())).not.toThrow();
  });

  it('reports nothing when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(getManualLyrics(makeSong())).toBeNull();
    expect(getManualLyricsStats().count).toBe(0);
  });

  it('builds a Manual payload from plain text', () => {
    const data = buildManualLyrics(makeSong(), '  Line one  \n\n Line two ');

    expect(data.provider).toBe('Manual');
    expect(data.plainLyrics).toBe('Line one\nLine two');
    expect(data.syncedLyrics).toEqual([]);
    expect(data.annotations).toEqual([]);
    expect(data.title).toBe('Breed');
  });

  it('builds a Manual payload with synced lines', () => {
    const data = buildManualLyrics(makeSong(), 'Line one', [
      { id: 'l0', startTimeMs: 1000, text: 'Line one' },
    ]);

    expect(data.syncedLyrics).toHaveLength(1);
    expect(data.syncedLyrics[0].startTimeMs).toBe(1000);
  });

  it('validates the editor input against the documented limits', () => {
    expect(validateManualLyrics('')).toMatchObject({ ok: false });
    expect(validateManualLyrics('   \n  ')).toMatchObject({ ok: false });

    const tooManyLines = Array.from({ length: MAX_MANUAL_LINES + 1 }, (_, i) => `line ${i}`).join('\n');
    expect(validateManualLyrics(tooManyLines)).toMatchObject({ ok: false });

    const tooLong = 'x'.repeat(MAX_MANUAL_CHARS + 1);
    expect(validateManualLyrics(tooLong)).toMatchObject({ ok: false });

    expect(validateManualLyrics('one line')).toMatchObject({ ok: true, lineCount: 1 });
    expect(
      validateManualLyrics(Array.from({ length: MAX_MANUAL_LINES }, (_, i) => `line ${i}`).join('\n'))
    ).toMatchObject({ ok: true, lineCount: MAX_MANUAL_LINES });
  });

  it('drops a legacy-keyed entry when the normalized key is written', () => {
    const punctuated = makeSong({ title: 'Hey, Ya!', artist: 'Outkast' });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'hey, ya!|outkast': { ...makeManual(), provider: 'Manual' } })
    );

    saveManualLyrics(punctuated, makeManual());

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(Object.keys(stored)).toEqual(['hey ya|outkast']);
  });

  it('clears a legacy-keyed entry', () => {
    const punctuated = makeSong({ title: 'Hey, Ya!', artist: 'Outkast' });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'hey, ya!|outkast': { ...makeManual(), provider: 'Manual' } })
    );

    expect(clearManualLyrics(punctuated)).toBe(true);
    expect(getManualLyrics(punctuated)).toBeNull();
  });

  it('reports nothing when the storage accessor itself throws', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      vi.resetModules();
      const fresh = await import('./manualLyricsStore');
      expect(fresh.getManualLyrics(makeSong())).toBeNull();
      expect(fresh.getManualLyricsStats().count).toBe(0);
      expect(() => fresh.saveManualLyrics(makeSong(), makeManual())).not.toThrow();
      expect(() => fresh.clearAllManualLyrics()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});
