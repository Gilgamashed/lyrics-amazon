/**
 * Local, per-track manual metadata corrections.
 *
 * When a detected track shows a wrong title/artist, the user can correct it and
 * re-run the provider search. Overrides persist per normalized track identity
 * and are never written back to SMTC — they only shape the local song identity
 * used for lookup and display.
 */

import { identityKey } from './textNormalize';

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

/** Normalized identity for a detected track (spec 16 - decorated variants link). */
export function trackKey(title: string, artist: string): string {
  return identityKey(title, artist);
}

/** Legacy raw key written by versions <= 0.5.3-rc.3 (dual-read fallback). */
function legacyTrackKey(title: string, artist: string): string {
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

function toOverride(entry: unknown): MetaOverride | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<MetaOverride>;
  if (typeof candidate.title !== 'string' || typeof candidate.artist !== 'string') return null;
  return { title: candidate.title, artist: candidate.artist };
}

export function getOverride(title: string, artist: string): MetaOverride | null {
  const store = readStore();
  const key = trackKey(title, artist);
  const direct = toOverride(store[key]);
  if (direct) return direct;

  // Dual-read: lazily migrate an override written under the legacy raw key.
  const legacy = legacyTrackKey(title, artist);
  if (legacy !== key) {
    const old = toOverride(store[legacy]);
    if (old) {
      store[key] = old;
      delete store[legacy];
      writeStore(store);
      return old;
    }
  }
  return null;
}

export function setOverride(title: string, artist: string, override: MetaOverride): void {
  const store = readStore();
  store[trackKey(title, artist)] = { title: override.title, artist: override.artist };
  // A normalized write supersedes any legacy-keyed entry for the same track.
  const legacy = legacyTrackKey(title, artist);
  if (legacy !== trackKey(title, artist)) {
    delete store[legacy];
  }
  writeStore(store);
}

export function removeOverride(title: string, artist: string): void {
  const store = readStore();
  const key = trackKey(title, artist);
  const legacy = legacyTrackKey(title, artist);
  let changed = false;
  if (key in store) {
    delete store[key];
    changed = true;
  }
  if (legacy !== key && legacy in store) {
    delete store[legacy];
    changed = true;
  }
  if (changed) writeStore(store);
}

export function clearOverrides(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
