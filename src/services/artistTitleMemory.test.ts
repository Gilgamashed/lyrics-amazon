import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearArtistTitleMemory,
  forgetArtistTitle,
  getArtistTitle,
  rememberArtistTitle,
} from './artistTitleMemory';

const STORAGE_KEY = 'lyrics-amazon:artist-title-memory:v1';

describe('artistTitleMemory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for a blank or unknown artist', () => {
    expect(getArtistTitle('')).toBeNull();
    expect(getArtistTitle('   ')).toBeNull();
    expect(getArtistTitle('Unknown Artist')).toBeNull();
  });

  it('remembers and recalls a confirmed title case-insensitively', () => {
    rememberArtistTitle('Chevelle', 'The Red');

    expect(getArtistTitle('Chevelle')).toBe('The Red');
    expect(getArtistTitle('chevelle')).toBe('The Red');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toMatchObject({
      chevelle: { artist: 'Chevelle', title: 'The Red' },
    });
  });

  it('overwrites the previous title for the same artist', () => {
    rememberArtistTitle('Chevelle', 'The Red');
    rememberArtistTitle('Chevelle', 'Send the Pain Below');

    expect(getArtistTitle('Chevelle')).toBe('Send the Pain Below');
  });

  it('forgets one artist without touching the others', () => {
    rememberArtistTitle('Chevelle', 'The Red');
    rememberArtistTitle('Nirvana', 'Breed');

    expect(forgetArtistTitle('chevelle')).toBe(true);
    expect(getArtistTitle('Chevelle')).toBeNull();
    expect(getArtistTitle('Nirvana')).toBe('Breed');
    expect(forgetArtistTitle('Chevelle')).toBe(false);
  });

  it('clears every remembered title', () => {
    rememberArtistTitle('Chevelle', 'The Red');
    clearArtistTitleMemory();

    expect(getArtistTitle('Chevelle')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores blank titles, blank artists and the unknown-artist placeholder', () => {
    rememberArtistTitle('', 'The Red');
    rememberArtistTitle('Chevelle', '   ');
    rememberArtistTitle('Unknown Artist', 'The Red');

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(forgetArtistTitle('')).toBe(false);
    expect(forgetArtistTitle('Unknown Artist')).toBe(false);
  });

  it('survives malformed and non-object storage payloads', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    expect(getArtistTitle('Chevelle')).toBeNull();

    localStorage.setItem(STORAGE_KEY, '"just a string"');
    expect(getArtistTitle('Chevelle')).toBeNull();

    localStorage.setItem(STORAGE_KEY, '[]');
    expect(getArtistTitle('Chevelle')).toBeNull();
  });

  it('ignores a stored entry with a blank title', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chevelle: { artist: 'Chevelle', title: '   ', at: 1 } })
    );

    expect(getArtistTitle('Chevelle')).toBeNull();
  });

  it('degrades gracefully when localStorage read/write throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(getArtistTitle('Chevelle')).toBeNull();
    getItem.mockRestore();

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => rememberArtistTitle('Chevelle', 'The Red')).not.toThrow();
    setItem.mockRestore();

    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => clearArtistTitleMemory()).not.toThrow();
    removeItem.mockRestore();
  });

  it('degrades gracefully when the localStorage getter itself throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    try {
      expect(getArtistTitle('Chevelle')).toBeNull();
      expect(() => rememberArtistTitle('Chevelle', 'The Red')).not.toThrow();
      expect(() => clearArtistTitleMemory()).not.toThrow();
    } finally {
      if (descriptor) {
        Object.defineProperty(window, 'localStorage', descriptor);
      }
    }
  });
});
