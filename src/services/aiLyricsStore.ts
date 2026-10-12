import { LyricsData, Song } from '../types/lyrics';

const STORAGE_KEY = 'lyrics-amazon:ai-lyrics:v1';

type StoreMap = Record<string, LyricsData>;

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function songKey(song: Song): string {
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
  const entry = readStore()[songKey(song)];
  return entry && entry.provider === 'AI Sync' ? entry : null;
}

export function saveAILyrics(song: Song, data: LyricsData): void {
  if (data.provider !== 'AI Sync') return;
  const store = readStore();
  store[songKey(song)] = data;
  writeStore(store);
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
