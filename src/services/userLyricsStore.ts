import { LyricsData, Song } from '../types/lyrics';

const STORAGE_KEY = 'lyrics-amazon:user-accepted-lyrics:v1';

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
    // quota exceeded or storage disabled - fail silently
  }
}

export function getAcceptedLyrics(song: Song): LyricsData | null {
  const entry = readStore()[songKey(song)];
  return entry || null;
}

export function saveAcceptedLyrics(song: Song, data: LyricsData): void {
  const store = readStore();
  store[songKey(song)] = data;
  writeStore(store);
}

export function clearAcceptedLyrics(song: Song): void {
  const store = readStore();
  const key = songKey(song);
  if (key in store) {
    delete store[key];
    writeStore(store);
  }
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
