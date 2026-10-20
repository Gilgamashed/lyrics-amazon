import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOverrides,
  getOverride,
  removeOverride,
  setOverride,
  trackKey,
} from './metaOverrideStore';

const KEY = 'lyrics-amazon:meta-overrides:v1';

describe('trackKey', () => {
  it('normalises and joins title and artist', () => {
    expect(trackKey('  Rasa ', 'oktobernatt')).toBe('rasa|oktobernatt');
  });

  it('folds release noise so decorated variants share one identity', () => {
    expect(trackKey('Rasa (Remastered 2011)', 'oktobernatt')).toBe(
      trackKey('Rasa', 'oktobernatt')
    );
    expect(trackKey('Rasa [Explicit]', 'oktobernatt')).toBe(trackKey('Rasa', 'oktobernatt'));
  });
});

describe('metaOverrideStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists and retrieves an override by track identity', () => {
    setOverride('Artist name', 'oktobernatt', { title: 'Rasa', artist: 'oktobernatt' });

    expect(getOverride('Artist name', 'oktobernatt')).toEqual({
      title: 'Rasa',
      artist: 'oktobernatt',
    });
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({
      [trackKey('Artist name', 'oktobernatt')]: { title: 'Rasa', artist: 'oktobernatt' },
    });
  });

  it('links a fix across metadata variants (decorated <-> clean)', () => {
    setOverride('Rasa (Remastered 2011)', 'oktobernatt', {
      title: 'Rasa',
      artist: 'Oktobernatt',
    });
    expect(getOverride('Rasa', 'oktobernatt')).toEqual({
      title: 'Rasa',
      artist: 'Oktobernatt',
    });

    setOverride('Clean Title', 'Clean Artist', { title: 'Fixed', artist: 'Artist' });
    expect(getOverride('Clean Title [Explicit]', 'Clean Artist')).toEqual({
      title: 'Fixed',
      artist: 'Artist',
    });
  });

  it('dual-reads and lazily migrates a legacy raw-key override', () => {
    const legacyKey = 'rasa (remastered 2011)|oktobernatt';
    localStorage.setItem(
      KEY,
      JSON.stringify({ [legacyKey]: { title: 'Rasa', artist: 'Oktobernatt' } })
    );

    // The decorated reading's legacy key is the fallback; migration then lets
    // clean readings resolve too.
    expect(getOverride('Rasa (Remastered 2011)', 'oktobernatt')).toEqual({
      title: 'Rasa',
      artist: 'Oktobernatt',
    });
    expect(getOverride('Rasa', 'oktobernatt')).toEqual({
      title: 'Rasa',
      artist: 'Oktobernatt',
    });
    const stored = JSON.parse(localStorage.getItem(KEY) as string);
    expect(stored).toHaveProperty(trackKey('Rasa', 'oktobernatt'));
    expect(stored).not.toHaveProperty(legacyKey);
  });

  it('returns null for an unknown track', () => {
    expect(getOverride('a', 'b')).toBeNull();
  });

  it('removes a single override', () => {
    setOverride('a', 'b', { title: 'A', artist: 'B' });
    removeOverride('a', 'b');
    expect(getOverride('a', 'b')).toBeNull();
  });

  it('removeOverride also clears a legacy-keyed entry for the same track', () => {
    const legacyKey = 'rasa (remastered 2011)|oktobernatt';
    localStorage.setItem(
      KEY,
      JSON.stringify({ [legacyKey]: { title: 'Rasa', artist: 'Oktobernatt' } })
    );
    removeOverride('Rasa (Remastered 2011)', 'oktobernatt');
    const stored = JSON.parse(localStorage.getItem(KEY) as string);
    expect(stored).not.toHaveProperty(legacyKey);
  });

  it('removeOverride is a no-op for a missing track', () => {
    expect(() => removeOverride('x', 'y')).not.toThrow();
    expect(getOverride('x', 'y')).toBeNull();
  });

  it('clears all overrides', () => {
    setOverride('a', 'b', { title: 'A', artist: 'B' });
    clearOverrides();
    expect(getOverride('a', 'b')).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('ignores corrupt stored payloads', () => {
    localStorage.setItem(KEY, 'not-json');
    expect(getOverride('a', 'b')).toBeNull();

    localStorage.setItem(KEY, '42');
    expect(getOverride('a', 'b')).toBeNull();

    localStorage.setItem(KEY, '[]');
    expect(getOverride('a', 'b')).toBeNull();
  });

  it('ignores malformed entries', () => {
    localStorage.setItem(KEY, JSON.stringify({ [trackKey('a', 'b')]: { title: 1 } }));
    expect(getOverride('a', 'b')).toBeNull();
  });

  it('fails silently when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => setOverride('k', 'l', { title: 'a', artist: 'b' })).not.toThrow();
    expect(getOverride('k', 'l')).toBeNull();
    expect(() => removeOverride('k', 'l')).not.toThrow();
    expect(() => clearOverrides()).not.toThrow();
  });

  it('fails silently when a storage write throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setOverride('k', 'l', { title: 'a', artist: 'b' })).not.toThrow();
    spy.mockRestore();
  });

  it('fails silently when a storage remove throws', () => {
    setOverride('a', 'b', { title: 'A', artist: 'B' });
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => clearOverrides()).not.toThrow();
    spy.mockRestore();
  });

  it('treats a throwing localStorage access as unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(() => setOverride('k', 'l', { title: 'a', artist: 'b' })).not.toThrow();
      expect(getOverride('k', 'l')).toBeNull();
      expect(() => clearOverrides()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});
