import { LyricsData, Song } from '../types/lyrics';

interface CacheEntry {
  data: LyricsData;
  fetchedAt: number;
}

const MAX_ENTRIES = 20;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

function cacheKey(song: Song): string {
  return `${song.title.trim().toLowerCase()}|${song.artist.trim().toLowerCase()}`;
}

let accessOrder: string[] = [];

function touch(key: string): void {
  accessOrder = accessOrder.filter((k) => k !== key);
  accessOrder.push(key);
}

function evictIfNeeded(): void {
  while (cache.size > MAX_ENTRIES && accessOrder.length > 0) {
    const oldest = accessOrder.shift();
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
}

export function getCachedLyrics(song: Song): LyricsData | null {
  const key = cacheKey(song);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.fetchedAt > TTL_MS) {
    cache.delete(key);
    accessOrder = accessOrder.filter((k) => k !== key);
    return null;
  }

  touch(key);
  return entry.data;
}

export function setCachedLyrics(song: Song, data: LyricsData): void {
  const key = cacheKey(song);
  cache.set(key, { data, fetchedAt: Date.now() });
  touch(key);
  evictIfNeeded();
}

export function clearLyricsCache(): void {
  cache.clear();
  accessOrder = [];
}

export function getCacheStats(): { size: number; maxEntries: number } {
  return { size: cache.size, maxEntries: MAX_ENTRIES };
}