import { Song } from '../../types/lyrics';
import { httpFetch } from '../httpClient';
import { parseLrc } from '../lrcParser';
import { normalizeQueryText } from '../textNormalize';
import { passesIdentityGate, similarity } from '../matchScore';
import { withTimeoutSignal } from './base';
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

/** True when the track carries any identity field we can verify against. */
function hasIdentityFields(t: LrcLibTrack): boolean {
  return Boolean((t.trackName ?? '').trim() || (t.artistName ?? '').trim());
}

/**
 * `/api/get` needs an exact title/artist/duration match, so it 404s often.
 * When it misses, fall back to `/api/search` and pick the best result:
 * identity-gate first (never play a different song), then duration (±3s),
 * then the highest similarity score, preferring one that carries timing.
 * Candidates carrying no identity fields at all pass unverified.
 */
function pickBest(tracks: LrcLibTrack[], song: Song, duration: number): LrcLibTrack | null {
  const matched = tracks.filter(
    (t) => !hasIdentityFields(t) || passesIdentityGate(t.trackName ?? '', t.artistName ?? '', song.title, song.artist)
  );
  if (matched.length === 0) return null;

  const within = matched.filter(
    (t) => typeof t.duration === 'number' && Math.abs((t.duration as number) - duration) <= 3
  );
  if (within.length > 0) {
    return within.find((t) => t.syncedLyrics) ?? within[0];
  }

  let best: LrcLibTrack | null = null;
  let bestScore = -1;
  for (const t of matched) {
    const score = Math.min(
      similarity(t.trackName ?? '', song.title),
      t.artistName ? similarity(t.artistName, song.artist) : 1
    );
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

export async function fetchLrcLib(
  song: Song,
  timeoutMs = 4000,
  externalSignal?: AbortSignal
): Promise<LyricsProviderResult> {
  const { signal, cleanup } = withTimeoutSignal(timeoutMs, externalSignal);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'LRCLIB' };
  try {
    const duration = Math.round(song.durationMs / 1000);
    const queryTitle = normalizeQueryText(song.title);
    const queryArtist = normalizeQueryText(song.artist);
    const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
      queryTitle
    )}&artist_name=${encodeURIComponent(queryArtist)}&duration=${duration}`;

    const getRes = await requestWithRetry(getUrl, signal);
    if (getRes.ok) {
      const data = (await getRes.json()) as LrcLibTrack;
      // The server matched exactly on the normalized strings; still verify the
      // identity when the response carries it so a decorated lookalike never
      // wins silently.
      if (
        !hasIdentityFields(data) ||
        passesIdentityGate(data.trackName ?? '', data.artistName ?? '', song.title, song.artist)
      ) {
        const direct = toResult(data);
        if (direct) {
          cleanup();
          return direct;
        }
      }
    }

    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(
      `${queryTitle} ${queryArtist}`
    )}`;
    const searchRes = await requestWithRetry(searchUrl, signal);
    cleanup();
    if (!searchRes.ok) return empty;

    const list = (await searchRes.json()) as LrcLibTrack[];
    if (!Array.isArray(list) || list.length === 0) return empty;

    const best = pickBest(list, song, duration);
    return (best && toResult(best)) ?? empty;
  } catch {
    cleanup();
    return empty;
  }
}
