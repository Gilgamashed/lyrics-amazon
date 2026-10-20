import { Song } from '../../types/lyrics';
import { httpFetch } from '../httpClient';
import { parseLrc } from '../lrcParser';
import { normalizeQueryText } from '../textNormalize';
import { passesIdentityGate } from '../matchScore';
import { withTimeoutSignal } from './base';
import { LyricsProviderResult } from './types';

/**
 * Free, no-key deployment of the open-source Wilooper/Lyrica API
 * (github.com/Wilooper/Lyrica). Validated live during spec 14:
 *   GET /lyrics/?artist=..&song=..&timestamps=true
 *   -> { status, data: { lyrics, hasTimestamps, timed_lyrics: [{id,start_time,end_time,text}] } }
 * `start_time`/`end_time` are integer milliseconds. The public instance is a
 * free Render deployment, so it can cold-start slowly; callers give it a
 * longer per-request timeout and fall through to the next provider on failure.
 * Overridable with VITE_LYRICA_BASE_URL (self-host / alternate deployment).
 */
export const LYRICA_BASE_URL = (
  (import.meta.env?.VITE_LYRICA_BASE_URL as string | undefined)?.trim() ||
  'https://test-0k.onrender.com'
).replace(/\/+$/, '');

export interface LyricaCue {
  id?: string;
  start_time?: number;
  end_time?: number;
  text?: string;
}

export interface LyricaResponse {
  status?: string;
  data?: {
    lyrics?: string | null;
    hasTimestamps?: boolean;
    timed_lyrics?: LyricaCue[];
    syncedLyrics?: string | null;
    title?: string;
    artist?: string;
  };
}

function toPositiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

/**
 * Maps a Lyrica payload to a provider result: line-synced `timed_lyrics` win,
 * an LRC string is a future-proof fallback, then plain `lyrics`.
 */
export function toLyricaResult(payload: LyricaResponse): LyricsProviderResult | null {
  const data = payload?.data;
  if (!data) return null;

  const cues = Array.isArray(data.timed_lyrics) ? data.timed_lyrics : [];
  const lines = cues
    .map((cue, idx) => {
      const startTimeMs = toPositiveInt(cue.start_time);
      const text = typeof cue.text === 'string' ? cue.text.trim() : '';
      if (startTimeMs === undefined || !text) return null;
      return {
        id: `lyrica-${idx}`,
        startTimeMs,
        endTimeMs: toPositiveInt(cue.end_time),
        text,
      };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null)
    .sort((a, b) => a.startTimeMs - b.startTimeMs)
    .map((line, idx) => ({ ...line, id: `lyrica-${idx}` }));

  const plain =
    typeof data.lyrics === 'string' && data.lyrics.trim().length > 0 ? data.lyrics : undefined;

  if (lines.length > 0) {
    return { syncedLyrics: lines, plainLyrics: plain, hasSync: true, provider: 'Lyrica' };
  }

  if (typeof data.syncedLyrics === 'string') {
    const parsed = parseLrc(data.syncedLyrics);
    if (parsed.length > 0) {
      return { syncedLyrics: parsed, plainLyrics: plain, hasSync: true, provider: 'Lyrica' };
    }
  }

  if (plain) {
    return { syncedLyrics: undefined, plainLyrics: plain, hasSync: false, provider: 'Lyrica' };
  }

  return null;
}

export async function fetchLyrica(
  song: Song,
  timeoutMs = 12000,
  externalSignal?: AbortSignal
): Promise<LyricsProviderResult> {
  const { signal, cleanup } = withTimeoutSignal(timeoutMs, externalSignal);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'Lyrica' };
  try {
    const url = `${LYRICA_BASE_URL}/lyrics/?artist=${encodeURIComponent(
      normalizeQueryText(song.artist)
    )}&song=${encodeURIComponent(normalizeQueryText(song.title))}&timestamps=true`;
    const res = await httpFetch(url, { signal });
    if (!res.ok) {
      cleanup();
      return empty;
    }
    const payload = (await res.json()) as LyricaResponse;
    cleanup();
    // When the deployment echoes the matched title/artist, verify the identity
    // so a lookalike response never wins silently.
    const echoedTitle = payload?.data?.title;
    const echoedArtist = payload?.data?.artist;
    if (
      typeof echoedTitle === 'string' &&
      echoedTitle.trim() &&
      !passesIdentityGate(echoedTitle, echoedArtist ?? '', song.title, song.artist)
    ) {
      return empty;
    }
    return toLyricaResult(payload) ?? empty;
  } catch {
    cleanup();
    return empty;
  }
}
