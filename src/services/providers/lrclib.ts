import { Song } from '../../types/lyrics';
import { httpFetch } from '../httpClient';
import { parseLrc } from '../lrcParser';
import { normalize } from './base';
import { LyricsProviderResult } from './types';

interface LrcLibTrack {
  id?: number;
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * LRCLIB rate-limits aggressively (HTTP 429). Retry a single time after a short
 * backoff so a transient throttle does not drop the provider for the session.
 */
async function requestWithRetry(url: string, signal: AbortSignal): Promise<Response> {
  let response = await httpFetch(url, { signal });
  if (response.status === 429) {
    await sleep(RETRY_DELAY_MS);
    response = await httpFetch(url, { signal });
  }
  return response;
}

function toResult(track: LrcLibTrack): LyricsProviderResult | null {
  if (track.syncedLyrics) {
    const parsed = parseLrc(track.syncedLyrics);
    if (parsed.length > 0) {
      return {
        syncedLyrics: parsed,
        plainLyrics: track.plainLyrics || parsed.map((l) => l.text).join('\n'),
        hasSync: true,
        provider: 'LRCLIB',
      };
    }
  }
  if (track.plainLyrics) {
    return {
      syncedLyrics: undefined,
      plainLyrics: track.plainLyrics,
      hasSync: false,
      provider: 'LRCLIB',
    };
  }
  return null;
}

/**
 * `/api/get` needs an exact title/artist/duration match, so it 404s often.
 * When it misses, fall back to `/api/search` and pick the closest result by
 * duration (±3s), preferring one that carries synchronized timing.
 */
function pickBest(tracks: LrcLibTrack[], song: Song, duration: number): LrcLibTrack | null {
  const within = tracks.filter(
    (t) => typeof t.duration === 'number' && Math.abs((t.duration as number) - duration) <= 3
  );
  if (within.length > 0) {
    return within.find((t) => t.syncedLyrics) ?? within[0];
  }

  const normTitle = normalize(song.title);
  const normArtist = normalize(song.artist);
  const named = tracks.find(
    (t) => normalize(t.trackName ?? '') === normTitle && normalize(t.artistName ?? '') === normArtist
  );
  if (named) return named;

  return tracks.find((t) => t.syncedLyrics) ?? tracks[0] ?? null;
}

export async function fetchLrcLib(song: Song, timeoutMs = 4000): Promise<LyricsProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'LRCLIB' };
  try {
    const duration = Math.round(song.durationMs / 1000);
    const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
      song.title
    )}&artist_name=${encodeURIComponent(song.artist)}&duration=${duration}`;

    const getRes = await requestWithRetry(getUrl, controller.signal);
    if (getRes.ok) {
      const data = (await getRes.json()) as LrcLibTrack;
      const direct = toResult(data);
      if (direct) {
        clearTimeout(timeoutId);
        return direct;
      }
    }

    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(
      `${song.title} ${song.artist}`
    )}`;
    const searchRes = await requestWithRetry(searchUrl, controller.signal);
    clearTimeout(timeoutId);
    if (!searchRes.ok) return empty;

    const list = (await searchRes.json()) as LrcLibTrack[];
    if (!Array.isArray(list) || list.length === 0) return empty;

    const best = pickBest(list, song, duration);
    return (best && toResult(best)) ?? empty;
  } catch {
    clearTimeout(timeoutId);
    return empty;
  }
}
