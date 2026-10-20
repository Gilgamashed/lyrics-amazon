import { LyricsData, Song } from '../types/lyrics';
import { identityKey } from './textNormalize';
import { setCachedLyrics } from './lyricsCache';

const STORAGE_KEY = 'lyrics-amazon:ai-lyrics:v1';

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
    // Quota exceeded or storage disabled — fail silently, lyrics stay in memory.
  }
}

/**
 * Returns permanently saved AI-generated lyrics for a song, or `null`.
 * Only results with `provider === 'AI Sync'` are ever stored here.
 */
export function getSavedAILyrics(song: Song): LyricsData | null {
  const store = readStore();
  const key = songKey(song);
  const direct = store[key];
  if (direct !== undefined) return direct.provider === 'AI Sync' ? direct : null;

  // Dual-read: lazily migrate an entry written under the legacy raw key.
  const legacy = legacySongKey(song);
  if (legacy !== key && store[legacy] !== undefined) {
    const migrated = store[legacy];
    store[key] = migrated;
    delete store[legacy];
    writeStore(store);
    return migrated.provider === 'AI Sync' ? migrated : null;
  }
  return null;
}

export function saveAILyrics(song: Song, data: LyricsData): void {
  if (data.provider !== 'AI Sync') return;
  const store = readStore();
  store[songKey(song)] = data;
  // A normalized write supersedes any legacy-keyed entry for the same song.
  const legacy = legacySongKey(song);
  if (legacy !== songKey(song)) {
    delete store[legacy];
  }
  writeStore(store);
  // Write-through: fresh karaoke must beat a stale cached plain result in the
  // same session (spec 16 canonical local-first order).
  setCachedLyrics(song, data);
}

export function clearSavedAILyrics(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getSavedAILyricsStats(): { count: number } {
  return { count: Object.keys(readStore()).length };
}
