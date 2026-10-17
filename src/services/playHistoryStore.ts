import { Song } from '../types/lyrics';

const STORAGE_KEY = 'lyrics-amazon:play-history:v1';

/** A play only counts once at least this much real playback has elapsed. */
export const PLAY_THRESHOLD_MS = 30_000;

/** Position jumps larger than this are treated as seeks and do not accrue. */
export const MAX_STEP_MS = 2_500;

/** "Hot" window: the last 5 days. */
export const HOT_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

export type RankingPeriod = 'hot' | 'month' | 'lifetime';

/** Which app produced a play. Only `amazon` counts toward Most Listened. */
export type PlaySource = 'amazon' | 'other';

export interface PlayRecord {
  key: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  plays: number[];
  firstSeenAt: number;
  lastSeenAt: number;
  /** Absent on legacy records written before Amazon-scoped accounting. */
  source?: PlaySource;
}

export interface RankedSong {
  key: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  count: number;
  lastPlayedAt: number;
}

type StoreMap = Record<string, PlayRecord>;

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function songKey(song: Pick<Song, 'title' | 'artist'>): string {
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

/**
 * Records a scored play for a song at `at` (defaults to now), tagged with the
 * owning `source`. Idempotency for the ≥30s rule lives in `PlaySessionScorer`;
 * this is the durable write. Only `amazon` plays are ranked.
 */
export function recordPlay(song: Song, source: PlaySource, at: number = Date.now()): void {
  const store = readStore();
  const key = songKey(song);
  const existing = store[key];
  const entry: PlayRecord = existing ?? {
    key,
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArt: song.albumArt,
    plays: [],
    firstSeenAt: at,
    lastSeenAt: at,
  };
  entry.title = song.title;
  entry.artist = song.artist;
  entry.album = song.album;
  entry.albumArt = song.albumArt;
  entry.source = source;
  entry.plays.push(at);
  entry.lastSeenAt = at;
  store[key] = entry;
  writeStore(store);
}

function periodFilter(period: RankingPeriod, now: number): (at: number) => boolean {
  if (period === 'hot') {
    const cutoff = now - HOT_WINDOW_MS;
    return (at) => at >= cutoff;
  }
  if (period === 'month') {
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const monthStart = start.getTime();
    return (at) => at >= monthStart;
  }
  return () => true;
}

/** Returns the ranked songs for the requested period (descending by count). */
export function getRanking(period: RankingPeriod, now: number = Date.now()): RankedSong[] {
  const filter = periodFilter(period, now);
  const ranked: RankedSong[] = [];

  for (const record of Object.values(readStore())) {
    // Amazon-only accounting: non-Amazon and legacy (unflagged) records are excluded.
    if (record.source !== 'amazon') continue;
    const count = record.plays.filter(filter).length;
    if (count === 0) continue;
    const lastPlayedAt = record.plays.filter(filter).reduce((max, at) => Math.max(max, at), 0);
    ranked.push({
      key: record.key,
      title: record.title,
      artist: record.artist,
      album: record.album,
      albumArt: record.albumArt,
      count,
      lastPlayedAt,
    });
  }

  return ranked.sort((a, b) => b.count - a.count || b.lastPlayedAt - a.lastPlayedAt);
}

export function getHistoryStats(): { songs: number; plays: number } {
  const records = Object.values(readStore()).filter((record) => record.source === 'amazon');
  return {
    songs: records.length,
    plays: records.reduce((sum, record) => sum + record.plays.length, 0),
  };
}

export function resetHistory(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Tracks acknowledgement of real playback for the current track session and
 * awards a single play once `PLAY_THRESHOLD_MS` has accrued. Forward seek jumps
 * larger than `MAX_STEP_MS` (and pauses/rewinds) do not count.
 */
export class PlaySessionScorer {
  private accumulated = 0;
  private lastPositionMs: number | null = null;

  constructor(private readonly thresholdMs: number = PLAY_THRESHOLD_MS) {}

  get accumulatedMs(): number {
    return this.accumulated;
  }

  reset(): void {
    this.accumulated = 0;
    this.lastPositionMs = null;
  }

  /** Feed a position sample; returns true exactly once when the play is earned. */
  addPosition(positionMs: number): boolean {
    if (this.accumulated >= this.thresholdMs) return false;
    const previous = this.lastPositionMs;
    this.lastPositionMs = positionMs;
    if (previous === null) return false;
    const delta = positionMs - previous;
    if (delta <= 0 || delta > MAX_STEP_MS) return false;
    this.accumulated += delta;
    return this.accumulated >= this.thresholdMs;
  }
}
