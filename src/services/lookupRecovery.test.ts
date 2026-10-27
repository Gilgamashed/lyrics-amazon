/**
 * Spec 17, W4 - lookup recovery for the "cursed songs".
 *
 * The four live samples recorded during the investigation are replayed here
 * against the provider behaviour that was observed at the time, so a regression
 * in the query variants or the identity gate is caught without touching the
 * network:
 *
 * - `Breed`        - the player reported the title but no artist (RC2).
 * - `The Red`      - the player reported no title at all (RC1).
 * - `It Dies Today`- no title, and the artist slot holds the track name (RC1).
 * - `Much The Same`- the title and the artist slot hold the same string (RC1).
 *
 * A non-Latin title is replayed as well: it must survive the normalization
 * and reach the wire intact (RC5).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Song } from '../types/lyrics';
import { inspectMetadata } from './metadataSanitizer';
import { fetchLyrics } from './lyricsService';
import { clearLyricsCache } from './lyricsCache';

interface RecordedTrack {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  syncedLyrics: string;
}

/**
 * The recorded LRCLIB answers for the queries the four cursed songs produce.
 * The key is the free-text search query exactly as it goes on the wire.
 */
const RECORDED_LRCLIB_SEARCH: Record<string, RecordedTrack[]> = {
  // `q=breed` - the artist was unknown, so only the title goes on the wire.
  breed: [
    {
      id: 101,
      trackName: 'Breed',
      artistName: 'Nirvana',
      duration: 126,
      syncedLyrics: '[00:12.00] I am breed\n[00:15.00] and the world is a dog',
    },
  ],
  // `q=chevalle` - the title was not reported, so the artist is the identity.
  chevelle: [
    {
      id: 102,
      trackName: 'The Red',
      artistName: 'Chevelle',
      duration: 222,
      syncedLyrics: '[00:30.00] This is the red\n[00:33.00] and the rest is gone',
    },
  ],
  // `q=it dies today` - the artist slot holds the track name.
  'it dies today': [
    {
      id: 103,
      trackName: 'It Dies Today',
      artistName: 'It Dies Today',
      duration: 210,
      syncedLyrics: '[00:20.00] It dies today\n[00:24.00] and no one cares',
    },
  ],
  // `q=much the same` - the title and the artist slot held the same string.
  'much the same': [
    {
      id: 104,
      trackName: 'Much The Same',
      artistName: 'A Day To Remember',
      duration: 190,
      syncedLyrics: '[00:10.00] Much the same\n[00:14.00] as always',
    },
  ],
  // The non-Latin title keeps its own characters on the wire.
  '東京事変 椎名林檎': [
    {
      id: 105,
      trackName: '東京事変',
      artistName: '椎名林檎',
      duration: 300,
      syncedLyrics: '[00:05.00] COLORful 君のままで\n[00:09.00] 誰にも見せない',
    },
  ],
};

function jsonOk(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

function jsonMissing(): Response {
  return { ok: false, status: 404, json: async () => ({}) } as Response;
}

/**
 * Builds the song the app would build from a raw player reading.
 */
function songFromReading(
  rawTitle: string | null,
  rawArtist: string | null,
  durationMs = 200_000
): Song {
  const inspection = inspectMetadata(rawTitle, rawArtist);
  if (!inspection.ok) throw new Error('the reading is empty');
  return {
    id: `recorded-${rawTitle ?? ''}-${rawArtist ?? ''}`,
    title: inspection.title,
    artist: inspection.artist,
    album: 'Recorded album',
    albumArt: '',
    durationMs,
    titleMissing: inspection.titleMissing,
    splitFrom: inspection.splitFrom,
  };
}

/**
 * Replays the recorded provider behaviour: LRCLIB answers the recorded search
 * queries, every other request misses.
 */
function stubRecordedProvider(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.includes('lrclib.net/api/search')) {
      const query = decodeURIComponent(
        url.split('q=')[1]?.split('&')[0] ?? ''
      ).toLowerCase();
      const recorded = RECORDED_LRCLIB_SEARCH[query];
      if (recorded) return Promise.resolve(jsonOk(recorded));
      return Promise.resolve(jsonOk([]));
    }
    return Promise.resolve(jsonMissing());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('lookup recovery for the cursed songs (spec 17, W4)', () => {
  beforeEach(() => {
    clearLyricsCache();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves "Breed" although the player reported no artist', async () => {
    const fetchMock = stubRecordedProvider();
    const song = songFromReading('Breed', '');

    const result = await fetchLyrics(song);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('LRCLIB');
    expect(result?.syncedLyrics?.[0].text).toBe('I am breed');

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    // The unknown artist never reaches the wire (RC2).
    expect(urls.some((u) => u.toLowerCase().includes('unknown'))).toBe(false);
    // Only the title is queried, so /api/get (which needs an artist) is skipped.
    expect(urls.some((u) => u.includes('/api/get'))).toBe(false);
    expect(urls.some((u) => u.includes('q=breed'))).toBe(true);
  });

  it('resolves "The Red" although the player reported no title', async () => {
    const fetchMock = stubRecordedProvider();
    const song = songFromReading('', 'Chevelle');

    expect(song.title).toBe('');
    expect(song.titleMissing).toBe(true);

    const result = await fetchLyrics(song);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('LRCLIB');
    expect(result?.syncedLyrics?.[0].text).toBe('This is the red');

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('q=chevelle'))).toBe(true);
    // An empty title must not be asked for exactly (RC4).
    expect(urls.some((u) => u.includes('/api/get'))).toBe(false);
  });

  it('resolves "It Dies Today" when the artist slot holds the track name', async () => {
    stubRecordedProvider();
    const song = songFromReading('', 'It Dies Today');

    const result = await fetchLyrics(song);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('LRCLIB');
    expect(result?.syncedLyrics?.[0].text).toBe('It dies today');
  });

  it('resolves "Much The Same" when the title and the artist slot are the same', async () => {
    const fetchMock = stubRecordedProvider();
    const song = songFromReading('Much The Same', 'Much The Same');

    // The duplicate reading is read as title-only, so the artist is unknown.
    expect(song.artist).toBe('Unknown Artist');

    const result = await fetchLyrics(song);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('LRCLIB');
    expect(result?.syncedLyrics?.[0].text).toBe('Much the same');

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('q=much%20the%20same'))).toBe(true);
    expect(urls.some((u) => u.toLowerCase().includes('unknown'))).toBe(false);
  });

  it('keeps a non-Latin title intact on the wire', async () => {
    const fetchMock = stubRecordedProvider();
    const song = songFromReading('東京事変', '椎名林檎');

    const result = await fetchLyrics(song);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('LRCLIB');
    expect(result?.syncedLyrics?.[0].text).toBe('COLORful 君のままで');

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => decodeURIComponent(u).includes('東京事変'))).toBe(true);
  });

  it('never queries with an empty title', async () => {
    const fetchMock = stubRecordedProvider();
    const song = songFromReading('', 'Chevelle');

    await fetchLyrics(song);

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => !decodeURIComponent(u).includes('track_name=&'))).toBe(true);
  });
});
