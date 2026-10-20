import { LyricsData, Song } from '../types/lyrics';
import { identityKey } from './textNormalize';
import { setCachedLyrics } from './lyricsCache';

const STORAGE_KEY = 'lyrics-amazon:user-accepted-lyrics:v1';

type StoreMap = Record<string, LyricsData>;

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/** Normalized lookup identity (spec 16) - decorated/clean readings share one key. */
function songKey(song: Song): string {
  return identityKey(song.title, song.artist);
}

/** Legacy raw key written by versions <= 0.5.3-rc.3 (dual-read fallback). */
function legacySongKey(song: Song): string {
  return `${song.title.trim().toLowerCase()}|${song.artist.trim().toLowerCase()}`;
}

function readStore(): StoreMap {
  if (!storageAvailable()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoreMap) : {};
  } catch {
    return {};
  }
}

function writeStore(store: StoreMap): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota exceeded or storage disabled - fail silently
  }
}

export function getAcceptedLyrics(song: Song): LyricsData | null {
  const store = readStore();
  const key = songKey(song);
  const direct = store[key];
  if (direct !== undefined) return direct;

  // Dual-read: lazily migrate an entry written under the legacy raw key.
  const legacy = legacySongKey(song);
  if (legacy !== key && store[legacy] !== undefined) {
    store[key] = store[legacy];
    delete store[legacy];
    writeStore(store);
    return store[key];
  }
  return null;
}

export function saveAcceptedLyrics(song: Song, data: LyricsData): void {
  const store = readStore();
  store[songKey(song)] = data;
  // A normalized write supersedes any legacy-keyed entry for the same song.
  const legacy = legacySongKey(song);
  if (legacy !== songKey(song)) {
    delete store[legacy];
  }
  writeStore(store);
  // Write-through: a later same-session lookup must see this result, not a
  // stale cached pre-save entry (spec 16 canonical local-first order).
  setCachedLyrics(song, data);
}

export function clearAcceptedLyrics(song: Song): void {
  const store = readStore();
  const key = songKey(song);
  const legacy = legacySongKey(song);
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

export function clearAllAcceptedLyrics(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getAcceptedLyricsStats(): { count: number } {
  return { count: Object.keys(readStore()).length };
}
