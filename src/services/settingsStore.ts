import { AppSettings, BackgroundTheme, LayoutPresetId, ViewMode, WindowTheme } from '../types/lyrics';

const STORAGE_KEY = 'lyrics-amazon:settings:v1';

export const DEFAULT_SETTINGS: AppSettings = {
  window: {
    opacity: 0.9,
    blur: 16,
    viewMode: 'karaoke',
    theme: 'acrylic',
    fontSize: 'medium',
    autoScroll: true,
  },
  backgroundTheme: 'amazon-music',
  layoutPreset: 'standard',
  syncOffsetMs: 0,
};

const THEMES: WindowTheme[] = ['acrylic', 'midnight', 'obsidian', 'cyan'];
const FONT_SIZES: AppSettings['window']['fontSize'][] = ['small', 'medium', 'large', 'xlarge'];
const VIEW_MODES: ViewMode[] = ['karaoke', 'sheet', 'manual'];
const BACKGROUNDS: BackgroundTheme[] = ['amazon-music', 'studio', 'minimal'];
const LAYOUTS: LayoutPresetId[] = ['compact', 'standard', 'wide'];

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Coerces arbitrary persisted data into a valid AppSettings object, falling
 * back to defaults for any missing/invalid field. Keeps restarts resilient to
 * schema drift or hand-edited storage.
 */
export function normalizeSettings(raw: unknown): AppSettings {
  const defaults = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...defaults, window: { ...defaults.window } };
  const value = raw as Partial<AppSettings>;
  const win = (value.window ?? {}) as Partial<AppSettings['window']>;

  return {
    window: {
      opacity: clamp(win.opacity as number, 0.15, 1, defaults.window.opacity),
      blur: Math.round(clamp(win.blur as number, 0, 24, defaults.window.blur)),
      viewMode: VIEW_MODES.includes(win.viewMode as ViewMode)
        ? (win.viewMode as ViewMode)
        : defaults.window.viewMode,
      theme: THEMES.includes(win.theme as WindowTheme)
        ? (win.theme as WindowTheme)
        : defaults.window.theme,
      fontSize: FONT_SIZES.includes(win.fontSize as AppSettings['window']['fontSize'])
        ? (win.fontSize as AppSettings['window']['fontSize'])
        : defaults.window.fontSize,
      autoScroll: typeof win.autoScroll === 'boolean' ? win.autoScroll : defaults.window.autoScroll,
    },
    backgroundTheme: BACKGROUNDS.includes(value.backgroundTheme as BackgroundTheme)
      ? (value.backgroundTheme as BackgroundTheme)
      : defaults.backgroundTheme,
    layoutPreset: LAYOUTS.includes(value.layoutPreset as LayoutPresetId)
      ? (value.layoutPreset as LayoutPresetId)
      : defaults.layoutPreset,
    syncOffsetMs: clamp(value.syncOffsetMs as number, -10000, 10000, defaults.syncOffsetMs),
  };
}

export function loadSettings(): AppSettings {
  if (!storageAvailable()) return { ...DEFAULT_SETTINGS, window: { ...DEFAULT_SETTINGS.window } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, window: { ...DEFAULT_SETTINGS.window } };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS, window: { ...DEFAULT_SETTINGS.window } };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota exceeded or storage disabled - fail silently
  }
}

export function clearSettings(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
