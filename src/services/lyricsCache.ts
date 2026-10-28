import { LyricsData, Song } from '../types/lyrics';
import { identityKey } from './textNormalize';

interface CacheEntry {
  data: LyricsData;
  fetchedAt: number;
}

const MAX_ENTRIES = 20;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'lyrics-amazon:lyrics-cache:v1';

const cache = new Map<string, CacheEntry>();

let accessOrder: string[] = [];

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Keys are the normalized lookup identity (spec 16). The cache is persisted
 * only from this version onward, so no legacy raw-key entries can exist.
 */
function cacheKey(song: Song): string {
  return identityKey(song.title, song.artist);
}

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

/** Mirrors the in-memory LRU into localStorage (quota-safe, best-effort). */
function persist(): void {
  if (!storageAvailable()) return;
  try {
    const mirror: Record<string, CacheEntry> = {};
    for (const [key, entry] of cache) {
      mirror[key] = entry;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mirror));
  } catch {
    // quota exceeded or storage disabled - cache stays memory-only
  }
}

/** Rehydrates the bounded cache at startup so lookups hit locally even across restarts. */
function hydrate(): void {
  if (!storageAvailable()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const now = Date.now();
    for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<CacheEntry>;
      if (typeof candidate.fetchedAt !== 'number') continue;
      if (!candidate.data || typeof candidate.data !== 'object') continue;
      if (now - candidate.fetchedAt > TTL_MS) continue;
      if (cache.has(key)) continue;
      cache.set(key, { data: candidate.data as LyricsData, fetchedAt: candidate.fetchedAt });
      accessOrder.push(key);
    }
    evictIfNeeded();
  } catch {
    // corrupt payload - start empty
  }
}

hydrate();

export function getCachedLyrics(song: Song): LyricsData | null {
  const key = cacheKey(song);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.fetchedAt > TTL_MS) {
    cache.delete(key);
    accessOrder = accessOrder.filter((k) => k !== key);
    persist();
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
  persist();
}

export function clearLyricsCache(): void {
  cache.clear();
  accessOrder = [];
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Removes one song from the cache (spec 19).
 *
 * Manual lyrics are written through to the cache, so deleting the manual
 * entry must also evict the cached copy - otherwise the deleted lyrics keep
 * rendering.
 */
export function removeCachedLyrics(song: Song): boolean {
  const key = cacheKey(song);
  const existed = cache.delete(key);
  accessOrder = accessOrder.filter((entry) => entry !== key);
  if (existed) persist();
  return existed;
}

export function getCacheStats(): { size: number; maxEntries: number } {
  return { size: cache.size, maxEntries: MAX_ENTRIES };
}
