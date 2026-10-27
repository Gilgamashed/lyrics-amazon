/**
 * Artist-scoped memory: remember the title the user confirmed for an artist
 * so the next reading of that artist resolves without asking again.
 */

import { debugLog } from './debugConsole';
import { isUnknownArtist } from './textNormalize';

const STORAGE_KEY = 'lyrics-amazon:artist-title-memory:v1';

export interface ArtistTitleMemory {
  title: string;
  artist: string;
  at: number;
}

type MemoryMap = Record<string, ArtistTitleMemory>;

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

function keyFor(artist: string): string {
  return artist.trim().toLowerCase();
}

function readStore(): MemoryMap {
  if (!storageAvailable()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as MemoryMap;
  } catch {
    return {};
  }
}

function writeStore(store: MemoryMap): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function getArtistTitle(artist: string): string | null {
  if (!artist || isUnknownArtist(artist)) return null;
  const store = readStore();
  const entry = store[keyFor(artist)];
  if (entry && entry.title && entry.title.trim()) return entry.title;
  return null;
}

export function rememberArtistTitle(artist: string, title: string): void {
  if (!artist || !title) return;
  if (isUnknownArtist(artist)) return;
  if (!title.trim()) return;
  const store = readStore();
  store[keyFor(artist)] = { artist: artist.trim(), title: title.trim(), at: Date.now() };
  writeStore(store);
  debugLog('override', 'artist-title-remembered', { artist: artist.trim(), title: title.trim() });
}

/**
 * Forgets the title remembered for an artist (spec 17, W2).
 *
 * Reverting a manual fix must also forget the remembered title; otherwise the
 * next poll tick would silently re-apply it and undo the revert.
 */
export function forgetArtistTitle(artist: string): boolean {
  if (!artist || isUnknownArtist(artist)) return false;
  const store = readStore();
  const key = keyFor(artist);
  if (!(key in store)) return false;
  delete store[key];
  writeStore(store);
  debugLog('override', 'artist-title-forgotten', { artist: artist.trim() });
  return true;
}

/** Clears every remembered artist/title pair (used by tests and diagnostics). */
export function clearArtistTitleMemory(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
