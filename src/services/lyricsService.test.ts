import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIConfig, LyricLine, LyricsData } from '../types/lyrics';
import { CURATED_TRACKS } from './curatedTracks';
import { clearLyricsCache } from './lyricsCache';
import { getSavedAILyrics } from './aiLyricsStore';
import { saveAcceptedLyrics } from './userLyricsStore';
import { fetchLyrics, parseLrc, searchTracks } from './lyricsService';
import { synthesizeLyrics } from './aiService';

vi.mock('./aiService', { spy: true });

const AI_CONFIG: AIConfig = {
  providerUrl: 'https://llm.example.com/v1',
  model: 'm',
  apiKey: 'sk',
  enabled: true,
};

const SONG = {
  id: 'test-id-1',
  title: 'Random Test Track',
  artist: 'Test Voice',
  album: 'Test Album',
  albumArt: '',
  durationMs: 200_000,
  year: '2026',
};

function jsonOk(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

function makeAccepted(text: string): LyricsData {
  return {
    songId: SONG.id,
    title: SONG.title,
    artist: SONG.artist,
    album: SONG.album,
    albumArt: '',
    provider: 'azlyrics',
    syncedLyrics: [{ id: 'acc-0', startTimeMs: 0, text }],
    plainLyrics: text,
    annotations: [],
    trivia: [],
  };
}

function abortableFetch() {
  return vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      })
  );
}

describe('parseLrc', () => {
  it('returns an empty array for empty input', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('   \n \n  ')).toEqual([]);
  });

  it('parses a timestamp into milliseconds', () => {
    const lines = parseLrc('[00:14.20] Hello from the other side');
    expect(lines).toHaveLength(1);
    expect(lines[0].startTimeMs).toBe(14_200);
    expect(lines[0].text).toBe('Hello from the other side');
    expect(lines[0].section).toBe('verse');
    expect(lines[0].id).toBe('line-0');
  });

  it('handles two digit fractional seconds; single digit is not parseable', () => {
    expect(parseLrc('[00:01.5] A')).toEqual([]);
    expect(parseLrc('[00:01.50] B')[0].startTimeMs).toBe(1500);
    expect(parseLrc('[01:02.50] C')[0].startTimeMs).toBe(62_500);
    expect(parseLrc('[00:01.050] D')[0].startTimeMs).toBe(1050);
  });

  it('parses the first tag when a line carries multiple timestamps', () => {
    const lines = parseLrc('[00:03.00][00:12.00] Repeating lyric');
    expect(lines).toHaveLength(1);
    expect(lines[0].startTimeMs).toBe(3000);
    expect(lines[0].text).toBe('Repeating lyric');
  });

  it('drops lines with no text and skips metadata tags', () => {
    expect(parseLrc('[00:14.20]')).toEqual([]);
    expect(parseLrc('[00:14.20]   ')).toEqual([]);
    expect(parseLrc('[ar:Artist]\n[ti:Title]\n[00:05.00] Real lyric\n')).toHaveLength(1);
  });

  it('infers sections from keywords', () => {
    const byLabel: [string, LyricLine['section']][] = [
      ['[00:00.00] Chorus is coming', 'chorus'],
      ['[00:00.00] bridge section', 'bridge'],
      ['[00:00.00] intro lights', 'intro'],
      ['[00:00.00] an outro sweeps', 'outro'],
      ['[00:00.00] guitar solo takes off', 'instrumental'],
      ['[00:00.00] plain verse lyrics', 'verse'],
    ];
    for (const [lrc, section] of byLabel) {
      expect(parseLrc(lrc)[0].section).toBe(section);
    }
  });

  it('strips a leading [verse] style bracket tag from the text and sorts ascending', () => {
    const lines = parseLrc('[00:30.00] Later line\n[00:00.00] EARLY line\n[00:15.00][Verse] lead in');
    expect(lines.map((l) => l.startTimeMs)).toEqual([0, 15_000, 30_000]);
    // "[Verse]" was detected as a section keyword, then removed from the text.
    expect(lines[1].text).toBe('lead in');
    expect(lines[1].section).toBe('verse');
  });
});

describe('searchTracks', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the curated list without fetching for an empty query', async () => {
    const result = await searchTracks('   ');
    expect(result).toBe(CURATED_TRACKS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('merges remote LRCLIB results with local matches and dedupes', async () => {
    const local = CURATED_TRACKS[0];
    fetchMock.mockResolvedValue(
      jsonOk([
        {
          id: 123,
          trackName: 'Complete Remote Track',
          artistName: 'Remote Artist',
          albumName: 'Remote Album',
          duration: 222,
        },
        {
          id: 456,
          trackName: local.title,
          artistName: local.artist,
          albumName: 'Extra',
          duration: 130,
        },
      ])
    );

    const result = await searchTracks(local.title);

    const remote = result.filter((t) => t.id === 'lrc-123');
    expect(remote).toHaveLength(1);
    expect(remote[0].title).toBe('Complete Remote Track');
    expect(remote[0].artist).toBe('Remote Artist');
    expect(remote[0].album).toBe('Remote Album');
    expect(remote[0].durationMs).toBe(222_000);
    expect(remote[0].amazonMusicUrl).toContain('Complete%20Remote%20Track');
    // The remote item matching title+artist of a local track was deduped.
    expect(result.some((t) => t.id === 'lrc-456')).toBe(false);
    // Local matches still present.
    expect(result.some((t) => t.id === local.id)).toBe(true);

    const called = fetchMock.mock.calls[0][0] as string;
    expect(called).toContain(`q=${encodeURIComponent(local.title)}`);
  });

  it('caps remote results to eight', async () => {
    const remote = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      trackName: `Remote ${i}`,
      artistName: 'A',
      albumName: 'B',
      duration: 100,
    }));
    fetchMock.mockResolvedValue(jsonOk(remote));

    const result = await searchTracks('zzz-no-local-match');
    expect(result.filter((t) => t.id.startsWith('lrc-'))).toHaveLength(8);
  });

  it('falls back to a custom track on a failed lookup', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const result = await searchTracks('Lindsey Sterling - Crystallize');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Lindsey Sterling');
    expect(result[0].artist).toBe('Crystallize');
    expect(result[0].id.startsWith('custom-')).toBe(true);
  });

  it('falls back when the remote shape is wrong or non-2xx', async () => {
    fetchMock.mockResolvedValue(jsonOk({ not: 'an array' }));
    const result = await searchTracks('something unique');
    expect(result).toHaveLength(1);

    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    const result2 = await searchTracks('something unique');
    expect(result2).toHaveLength(1);
  });

  it('aborts the remote request after the timeout and falls back', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(abortableFetch());

    const pending = searchTracks('never resolves');
    await vi.advanceTimersByTimeAsync(3600);
    const result = await pending;
    expect(result).toHaveLength(1);
  });
});

describe('fetchLyrics', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    clearLyricsCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns curated data without any network call', async () => {
    const song = { ...SONG, id: 'espresso-sabrina-carpenter', title: 'Espresso', artist: 'Sabrina Carpenter' };
    const result = await fetchLyrics(song);
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('Genius');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result?.syncedLyrics.length).toBeGreaterThan(20);
  });

  it('parses synced LRCLIB responses with generated annotations', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({
        syncedLyrics: '[00:01.00] A fairly long first line\n[00:02.00] Second fairly long line\n[00:03.00] Third fairly long line',
        plainLyrics: '',
        albumName: 'LP',
      })
    );

    const result = await fetchLyrics(SONG);
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('LRCLIB');
    expect(result?.songId).toBe(SONG.id);
    expect(result?.syncedLyrics).toHaveLength(3);
    expect(result?.syncedLyrics[0].startTimeMs).toBe(1000);
    expect(result?.annotations).toHaveLength(2);
    expect(result?.syncedLyrics[0].annotationId).toBe('gen-ann-1');
    const lrclibUrl = fetchMock.mock.calls
      .map((c) => c[0] as string)
      .find((url) => url.includes('lrclib.net'));
    expect(lrclibUrl).toContain('track_name=Random%20Test%20Track');
    expect(lrclibUrl).toContain('duration=200');
  });

  it('returns plain-only provider results without synthesizing timestamps', async () => {
    fetchMock.mockResolvedValue(jsonOk({ plainLyrics: 'Line one\n\nLine two\nLine three' }));
    const result = await fetchLyrics(SONG);
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('LRCLIB');
    expect(result?.syncedLyrics).toHaveLength(0);
    expect(result?.plainLyrics).toContain('Line one');
  });

  it('returns cached data on the second call without refetching', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({ syncedLyrics: '[00:01.00] A fairly long first line\n[00:02.00] Second fairly long line\n[00:03.00] Third fairly long line' })
    );

    const first = await fetchLyrics(SONG);
    const second = await fetchLyrics(SONG);
    expect(second).toBe(first);
    // Genius (empty) then LRCLIB (synced) on the cold path; cached on the second.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Bypassing the cache refetches (Genius + LRCLIB again).
    await fetchLyrics(SONG, { useCache: false });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('reuses permanently saved AI lyrics', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    // Seed the store exactly like saveAILyrics would.
    localStorage.setItem(
      'lyrics-amazon:ai-lyrics:v1',
      JSON.stringify({
        'random test track|test voice': {
          songId: SONG.id,
          title: SONG.title,
          artist: SONG.artist,
          album: SONG.album,
          albumArt: '',
          provider: 'AI Sync',
          syncedLyrics: [{ text: 'Saved line', startTimeMs: 100, id: 'x' }],
          plainLyrics: 'Saved line',
          annotations: [],
          trivia: [],
        },
      })
    );

    const result = await fetchLyrics(SONG, { aiConfig: AI_CONFIG });
    expect(result?.provider).toBe('AI Sync');
    expect(result?.syncedLyrics[0].text).toBe('Saved line');
  });

  it('calls the AI provider as a fallback and persists the result', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    const aiData: LyricsData = {
      songId: SONG.id,
      title: SONG.title,
      artist: SONG.artist,
      album: SONG.album,
      albumArt: '',
      provider: 'AI Sync',
      syncedLyrics: [{ text: 'AI lyric', startTimeMs: 200, id: 'ai-line-0' }],
      plainLyrics: 'AI lyric',
      annotations: [],
      trivia: [],
    };
    vi.mocked(synthesizeLyrics).mockResolvedValue(aiData);

    const result = await fetchLyrics(SONG, { aiConfig: AI_CONFIG });
    expect(result).toBe(aiData);
    expect(vi.mocked(synthesizeLyrics)).toHaveBeenCalledOnce();
    expect(getSavedAILyrics(SONG)).toEqual(aiData);
  });

  it('returns null (not found) and keeps AI disabled when no configuration is provided', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    const result = await fetchLyrics(SONG);
    expect(result).toBeNull();
    expect(vi.mocked(synthesizeLyrics)).not.toHaveBeenCalled();
  });

  it('returns null (not found) when every provider and AI miss', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    const result = await fetchLyrics(SONG);
    expect(result).toBeNull();
  });

  it('isolates provider timeouts and reports not found once the chain is exhausted', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(abortableFetch());

    const pending = fetchLyrics(SONG);
    await vi.advanceTimersByTimeAsync(20000);
    const result = await pending;
    expect(result).toBeNull();
  });

  it('prefers user-accepted lyrics over every provider', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({ syncedLyrics: '[00:01.00] Network line', plainLyrics: 'Network line' })
    );
    saveAcceptedLyrics(SONG, makeAccepted('Accepted override'));

    const result = await fetchLyrics(SONG);
    expect(result?.provider).toBe('azlyrics');
    expect(result?.syncedLyrics[0].text).toBe('Accepted override');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('advances the chain when startFromIndex skips earlier providers', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({
        syncedLyrics: '[00:01.00] A fairly long first line\n[00:02.00] Second fairly long line',
        plainLyrics: '',
      })
    );

    const result = await fetchLyrics(SONG, { startFromIndex: 1 });
    expect(result?.provider).toBe('LRCLIB');
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('genius.com'))).toBe(false);
    expect(urls.some((u) => u.includes('lrclib.net'))).toBe(true);
  });
});