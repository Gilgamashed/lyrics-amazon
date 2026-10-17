/**
 * Local, per-track manual metadata corrections.
 *
 * When a detected track shows a wrong title/artist, the user can correct it and
 * re-run the provider search. Overrides persist per detected track key and are
 * never written back to SMTC — they only shape the local song identity used for
 * lookup and display.
 */

const STORAGE_KEY = 'lyrics-amazon:meta-overrides:v1';

export interface MetaOverride {
  title: string;
  artist: string;
}

type OverrideMap = Record<string, MetaOverride>;

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

/** Key for a detected track, matching the play-history identity scheme. */
export function trackKey(title: string, artist: string): string {
  return `${title.trim().toLowerCase()}|${artist.trim().toLowerCase()}`;
}

function readStore(): OverrideMap {
  if (!storageAvailable()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as OverrideMap;
  } catch {
    return {};
  }
}

function writeStore(store: OverrideMap): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded or storage disabled - corrections are best-effort.
  }
}

export function getOverride(key: string): MetaOverride | null {
  const entry = readStore()[key];
  if (!entry || typeof entry.title !== 'string' || typeof entry.artist !== 'string') return null;
  return { title: entry.title, artist: entry.artist };
}

export function setOverride(key: string, override: MetaOverride): void {
  const store = readStore();
  store[key] = { title: override.title, artist: override.artist };
  writeStore(store);
}

export function removeOverride(key: string): void {
  const store = readStore();
  if (key in store) {
    delete store[key];
    writeStore(store);
  }
}

export function clearOverrides(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
