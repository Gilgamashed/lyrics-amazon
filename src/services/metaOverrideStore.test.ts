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
});

describe('metaOverrideStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists and retrieves an override by key', () => {
    const key = trackKey('Artist name', 'oktobernatt');
    setOverride(key, { title: 'Rasa', artist: 'oktobernatt' });

    expect(getOverride(key)).toEqual({ title: 'Rasa', artist: 'oktobernatt' });
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({
      [key]: { title: 'Rasa', artist: 'oktobernatt' },
    });
  });

  it('returns null for an unknown key', () => {
    expect(getOverride(trackKey('a', 'b'))).toBeNull();
  });

  it('removes a single override', () => {
    const key = trackKey('a', 'b');
    setOverride(key, { title: 'A', artist: 'B' });
    removeOverride(key);
    expect(getOverride(key)).toBeNull();
  });

  it('removeOverride is a no-op for a missing key', () => {
    expect(() => removeOverride(trackKey('x', 'y'))).not.toThrow();
    expect(getOverride(trackKey('x', 'y'))).toBeNull();
  });

  it('clears all overrides', () => {
    setOverride(trackKey('a', 'b'), { title: 'A', artist: 'B' });
    clearOverrides();
    expect(getOverride(trackKey('a', 'b'))).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('ignores corrupt stored payloads', () => {
    localStorage.setItem(KEY, 'not-json');
    expect(getOverride(trackKey('a', 'b'))).toBeNull();

    localStorage.setItem(KEY, '42');
    expect(getOverride(trackKey('a', 'b'))).toBeNull();

    localStorage.setItem(KEY, '[]');
    expect(getOverride(trackKey('a', 'b'))).toBeNull();
  });

  it('ignores malformed entries', () => {
    const key = trackKey('a', 'b');
    localStorage.setItem(KEY, JSON.stringify({ [key]: { title: 1 } }));
    expect(getOverride(key)).toBeNull();
  });

  it('fails silently when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => setOverride('k', { title: 'a', artist: 'b' })).not.toThrow();
    expect(getOverride('k')).toBeNull();
    expect(() => removeOverride('k')).not.toThrow();
    expect(() => clearOverrides()).not.toThrow();
  });

  it('fails silently when a storage write throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setOverride('k', { title: 'a', artist: 'b' })).not.toThrow();
    spy.mockRestore();
  });

  it('fails silently when a storage remove throws', () => {
    const key = trackKey('a', 'b');
    setOverride(key, { title: 'A', artist: 'B' });
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
      expect(() => setOverride('k', { title: 'a', artist: 'b' })).not.toThrow();
      expect(getOverride('k')).toBeNull();
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
