import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clearSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from './settingsStore';

const KEY = 'lyrics-amazon:settings:v1';

describe('normalizeSettings', () => {
  it('returns defaults for non-object input', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and coerces invalid ones', () => {
    const result = normalizeSettings({
      window: { opacity: 0.5, blur: 8, viewMode: 'sheet', theme: 'cyan', fontSize: 'xlarge', autoScroll: false },
      backgroundTheme: 'minimal',
      layoutPreset: 'wide',
      syncOffsetMs: 500,
    });
    expect(result).toEqual({
      window: { opacity: 0.5, blur: 8, viewMode: 'sheet', theme: 'cyan', fontSize: 'xlarge', autoScroll: false },
      backgroundTheme: 'minimal',
      layoutPreset: 'wide',
      syncOffsetMs: 500,
    });
  });

  it('falls back for unknown enum values and clamps numbers', () => {
    const result = normalizeSettings({
      window: { opacity: 99, blur: -5, viewMode: 'nope', theme: 'neon', fontSize: 'huge' },
      backgroundTheme: 'pink',
      layoutPreset: 'gigantic',
      syncOffsetMs: 999999,
    });
    expect(result.window.opacity).toBe(1);
    expect(result.window.blur).toBe(0);
    expect(result.window.viewMode).toBe('karaoke');
    expect(result.window.theme).toBe('acrylic');
    expect(result.window.fontSize).toBe('medium');
    expect(result.window.autoScroll).toBe(true);
    expect(result.backgroundTheme).toBe('amazon-music');
    expect(result.layoutPreset).toBe('standard');
    expect(result.syncOffsetMs).toBe(10000);
  });

  it('handles a missing window object', () => {
    expect(normalizeSettings({ backgroundTheme: 'studio' }).window).toEqual(DEFAULT_SETTINGS.window);
  });
});

describe('loadSettings / saveSettings / clearSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips saved settings', () => {
    const settings = normalizeSettings({ syncOffsetMs: 200, backgroundTheme: 'studio' });
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('clears stored settings', () => {
    saveSettings(DEFAULT_SETTINGS);
    clearSettings();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('fails silently when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    spy.mockRestore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns defaults when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(() => clearSettings()).not.toThrow();
  });
});
