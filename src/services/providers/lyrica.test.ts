import { afterEach, describe, expect, it, vi } from 'vitest';
import { Song } from '../../types/lyrics';
import { fetchLyrica, toLyricaResult, LYRICA_BASE_URL } from './lyrica';

const SONG: Song = {
  id: 's-1',
  title: 'Tum Hi Ho',
  artist: 'Arijit Singh',
  album: 'Aashiqui 2',
  albumArt: '',
  durationMs: 260_000,
};

function jsonResponse(payload: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => payload } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Mirrors the live pre-hosted Lyrica payload (integer-ms start_time/end_time).
const syncedPayload = {
  status: 'success',
  data: {
    artist: 'Arijit Singh',
    title: 'Tum Hi Ho',
    hasTimestamps: true,
    lyrics: 'first line\nsecond line',
    timed_lyrics: [
      { id: 'lrc_0', start_time: 0, end_time: 10214, text: 'first line' },
      { id: 'lrc_1', start_time: 10214, end_time: 15511, text: 'second line' },
      { id: 'lrc_2', start_time: 15511, end_time: 25657, text: 'third line' },
    ],
  },
};

describe('toLyricaResult', () => {
  it('maps timed_lyrics to sorted synchronized LyricLines', () => {
    const result = toLyricaResult(syncedPayload);
    expect(result?.provider).toBe('Lyrica');
    expect(result?.hasSync).toBe(true);
    expect(result?.syncedLyrics).toHaveLength(3);
    expect(result?.syncedLyrics?.[0]).toEqual({
      id: 'lyrica-0',
      startTimeMs: 0,
      endTimeMs: 10214,
      text: 'first line',
    });
    expect(result?.plainLyrics).toBe('first line\nsecond line');
  });

  it('sorts out-of-order cues by start time and re-indexes ids', () => {
    const result = toLyricaResult({
      data: {
        timed_lyrics: [
          { start_time: 5000, text: 'later' },
          { start_time: 1000, text: 'earlier' },
        ],
      },
    });
    expect(result?.syncedLyrics?.map((l) => l.text)).toEqual(['earlier', 'later']);
    expect(result?.syncedLyrics?.map((l) => l.id)).toEqual(['lyrica-0', 'lyrica-1']);
  });

  it('drops cues with a missing/invalid timestamp or blank text', () => {
    const result = toLyricaResult({
      data: {
        timed_lyrics: [
          { start_time: 1000, text: 'keep' },
          { text: 'no time' },
          { start_time: -5, text: 'negative' },
          { start_time: 2000, text: '   ' },
        ],
      },
    });
    expect(result?.syncedLyrics?.map((l) => l.text)).toEqual(['keep']);
    expect(result?.syncedLyrics?.[0].endTimeMs).toBeUndefined();
  });

  it('parses an LRC syncedLyrics string as a fallback', () => {
    const result = toLyricaResult({
      data: { syncedLyrics: '[00:01.00] A line\n[00:02.50] Another line', lyrics: 'A line' },
    });
    expect(result?.hasSync).toBe(true);
    expect(result?.syncedLyrics).toHaveLength(2);
    expect(result?.syncedLyrics?.[0].startTimeMs).toBe(1000);
  });

  it('returns plain-only when there is no timing', () => {
    const result = toLyricaResult({ data: { lyrics: 'just plain text' } });
    expect(result?.hasSync).toBe(false);
    expect(result?.plainLyrics).toBe('just plain text');
    expect(result?.syncedLyrics).toBeUndefined();
  });

  it('returns null for a missing or empty payload', () => {
    expect(toLyricaResult({})).toBeNull();
    expect(toLyricaResult({ data: {} })).toBeNull();
    expect(toLyricaResult({ data: { lyrics: '   ' } })).toBeNull();
    // An unparseable LRC string with no plain fallback yields null.
    expect(toLyricaResult({ data: { syncedLyrics: 'not lrc' } })).toBeNull();
  });
});

describe('fetchLyrica', () => {
  it('requests the artist/song with timestamps and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(syncedPayload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLyrica(SONG);
    expect(result.hasSync).toBe(true);
    expect(result.syncedLyrics).toHaveLength(3);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith(`${LYRICA_BASE_URL}/lyrics/?`)).toBe(true);
    // Queries go out normalized (lowercase, noise-stripped) per spec 16.
    expect(url).toContain('artist=arijit%20singh');
    expect(url).toContain('song=tum%20hi%20ho');
    expect(url).toContain('timestamps=true');
  });

  it('returns plain-only when the deployment has no timing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'success', data: { lyrics: 'plain only' } }))
    );
    const result = await fetchLyrica(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBe('plain only');
  });

  it('rejects an echoed title/artist that fails the identity gate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: 'success',
          data: {
            artist: 'Someone Else',
            title: 'A Totally Different Song',
            lyrics: 'wrong song lyrics',
            hasTimestamps: false,
          },
        })
      )
    );
    const result = await fetchLyrica(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBeUndefined();
  });

  it('accepts an echoed decorated title that passes the identity gate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: 'success',
          data: {
            artist: 'Arijit Singh',
            title: 'Tum Hi Ho (Remastered 2011)',
            lyrics: 'first line\nsecond line',
            hasTimestamps: false,
          },
        })
      )
    );
    const result = await fetchLyrica(SONG);
    expect(result.plainLyrics).toContain('first line');
  });

  it('returns an empty result on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 502)));
    const result = await fetchLyrica(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBeUndefined();
  });

  it('isolates network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchLyrica(SONG);
    expect(result.provider).toBe('Lyrica');
    expect(result.hasSync).toBe(false);
  });
});
