/**
 * User-authored ("Manual") lyrics (spec 19, W1).
 *
 * Manual and edited lyrics live in their own durable store, keyed by the
 * normalized lookup identity with a legacy raw-key fallback, exactly like the
 * thumbs-up store. A manual entry is written through to the lyrics cache so a
 * later same-session lookup sees it.
 */

import { LyricLine, LyricsData, Song } from '../types/lyrics';
import { identityKey } from './textNormalize';
import { setCachedLyrics } from './lyricsCache';

const STORAGE_KEY = 'lyrics-amazon:manual-lyrics:v1';

/** Documented editor limits (spec 19, W2). */
export const MAX_MANUAL_LINES = 300;
export const MAX_MANUAL_CHARS = 30_000;

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
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as StoreMap)
      : {};
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

export function getManualLyrics(song: Song): LyricsData | null {
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

/** True when the song has a saved manual entry (the `Manual (Synced)` view). */
export function hasManualLyrics(song: Song): boolean {
  return getManualLyrics(song) !== null;
}

export function saveManualLyrics(song: Song, data: LyricsData): void {
  const store = readStore();
  const key = songKey(song);
  store[key] = { ...data, provider: 'Manual' };
  // A normalized write supersedes any legacy-keyed entry for the same song.
  const legacy = legacySongKey(song);
  if (legacy !== songKey(song)) {
    delete store[legacy];
  }
  writeStore(store);
  // Write-through: a later same-session lookup must see the manual result.
  setCachedLyrics(song, store[key]);
}

export function clearManualLyrics(song: Song): boolean {
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
  return changed;
}

export function clearAllManualLyrics(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getManualLyricsStats(): { count: number } {
  return { count: Object.keys(readStore()).length };
}

/**
 * Builds the `Manual` payload for a song from the user's text.
 *
 * `synced` is the optional timestamped line set produced by Manual Sync; without
 * it the entry is a static (plain) manual lyric.
 */
export function buildManualLyrics(
  song: Song,
  text: string,
  synced?: LyricLine[]
): LyricsData {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const syncedLines = synced ?? [];
  return {
    songId: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArt: song.albumArt,
    provider: 'Manual',
    syncedLyrics: syncedLines,
    plainLyrics: lines.join('\n'),
    annotations: [],
    trivia: [],
  };
}

export interface ManualLyricsValidation {
  ok: boolean;
  error?: string;
  lineCount: number;
  charCount: number;
}

/** Validates the editor input against the documented limits. */
export function validateManualLyrics(text: string): ManualLyricsValidation {
  const lineCount = text.split('\n').filter((line) => line.trim().length > 0).length;
  const charCount = text.length;
  if (text.trim().length === 0) {
    return { ok: false, error: 'Enter at least one lyric line.', lineCount, charCount };
  }
  if (lineCount > MAX_MANUAL_LINES) {
    return {
      ok: false,
      error: `Too many lines (${lineCount}). The limit is ${MAX_MANUAL_LINES}.`,
      lineCount,
      charCount,
    };
  }
  if (charCount > MAX_MANUAL_CHARS) {
    return {
      ok: false,
      error: `Too much text (${charCount} characters). The limit is ${MAX_MANUAL_CHARS}.`,
      lineCount,
      charCount,
    };
  }
  return { ok: true, lineCount, charCount };
}
