import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIConfig, LyricLine, LyricsData } from '../types/lyrics';
import { clearLyricsCache } from './lyricsCache';
import { getSavedAILyrics } from './aiLyricsStore';
import { saveAcceptedLyrics } from './userLyricsStore';
import { fetchLyrics, parseLrc } from './lyricsService';
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
    provider: 'Genius',
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
    // Queries go out normalized (lowercase, noise-stripped) per spec 16.
    expect(lrclibUrl).toContain('track_name=random%20test%20track');
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
    // LRCLIB (synced-first) answers on the first request; cached on the second.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Bypassing the cache refetches (LRCLIB again).
    await fetchLyrics(SONG, { useCache: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('prefers saved AI-synced lyrics over a successful provider chain', async () => {
    // The chain would return a synced LRCLIB result, but a permanent AI sync
    // for the song must win the lookup (spec 14 §3.5/§5).
    fetchMock.mockResolvedValue(
      jsonOk({ syncedLyrics: '[00:01.00] Network line', plainLyrics: 'Network line' })
    );
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
          syncedLyrics: [{ text: 'Saved karaoke line', startTimeMs: 500, id: 'y' }],
          plainLyrics: 'Saved karaoke line',
          annotations: [],
          trivia: [],
        },
      })
    );

    const result = await fetchLyrics(SONG);
    expect(result?.provider).toBe('AI Sync');
    expect(result?.syncedLyrics[0].text).toBe('Saved karaoke line');
    expect(fetchMock).not.toHaveBeenCalled();
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
    await vi.advanceTimersByTimeAsync(30000);
    const result = await pending;
    expect(result).toBeNull();
  });

  it('prefers user-accepted lyrics over every provider', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({ syncedLyrics: '[00:01.00] Network line', plainLyrics: 'Network line' })
    );
    saveAcceptedLyrics(SONG, makeAccepted('Accepted override'));

    const result = await fetchLyrics(SONG);
    expect(result?.provider).toBe('Genius');
    expect(result?.syncedLyrics[0].text).toBe('Accepted override');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('orders accepted before saved AI before the session cache (canonical order)', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({ syncedLyrics: '[00:01.00] Network line', plainLyrics: 'Network line' })
    );
    const { setCachedLyrics, clearLyricsCache } = await import('./lyricsCache');
    clearLyricsCache();

    // Cache-only: the cache answers without touching the network.
    setCachedLyrics(SONG, makeAccepted('From cache'));
    expect((await fetchLyrics(SONG))?.plainLyrics).toBe('From cache');
    expect(fetchMock).not.toHaveBeenCalled();

    // Saved AI outranks the session cache.
    const aiData: LyricsData = { ...makeAccepted('From saved AI'), provider: 'AI Sync' };
    localStorage.setItem(
      'lyrics-amazon:ai-lyrics:v1',
      JSON.stringify({ 'random test track|test voice': aiData })
    );
    expect((await fetchLyrics(SONG))?.plainLyrics).toBe('From saved AI');
    expect(fetchMock).not.toHaveBeenCalled();

    // Accepted outranks saved AI.
    saveAcceptedLyrics(SONG, makeAccepted('From accepted'));
    expect((await fetchLyrics(SONG))?.plainLyrics).toBe('From accepted');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a saved karaoke result writes through and beats a stale cached plain result', async () => {
    fetchMock.mockResolvedValue(jsonOk({ plainLyrics: 'Stale plain line' }));
    const stale = await fetchLyrics(SONG, { useCache: false });
    expect(stale?.provider).toBe('LRCLIB');
    const { saveAILyrics } = await import('./aiLyricsStore');
    const karaoke: LyricsData = {
      ...makeAccepted('Fresh karaoke line'),
      provider: 'AI Sync',
      syncedLyrics: [{ id: 'k-0', startTimeMs: 0, text: 'Fresh karaoke line' }],
    };
    // Exactly what handleGenerateKaraoke does.
    saveAILyrics(SONG, karaoke);
    const { getCachedLyrics } = await import('./lyricsCache');
    expect(getCachedLyrics(SONG)?.provider).toBe('AI Sync');
    fetchMock.mockClear();

    const result = await fetchLyrics(SONG);
    expect(result?.provider).toBe('AI Sync');
    expect(result?.syncedLyrics[0].text).toBe('Fresh karaoke line');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a fresh accepted result wins over a stale cached entry in the same session', async () => {
    fetchMock.mockResolvedValue(jsonOk({ plainLyrics: 'Stale plain line' }));
    const stale = await fetchLyrics(SONG);
    expect(stale?.plainLyrics).toBe('Stale plain line');
    expect(fetchMock).toHaveBeenCalled();

    saveAcceptedLyrics(SONG, makeAccepted('User-approved line'));
    fetchMock.mockClear();

    const result = await fetchLyrics(SONG);
    expect(result?.plainLyrics).toBe('User-approved line');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('advances the chain when startFromIndex skips earlier providers', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({
        status: 'success',
        data: {
          timed_lyrics: [
            { start_time: 1000, text: 'A fairly long first line' },
            { start_time: 2000, text: 'Second fairly long line' },
          ],
        },
      })
    );

    const result = await fetchLyrics(SONG, { startFromIndex: 1 });
    expect(result?.provider).toBe('Lyrica');
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('lrclib.net'))).toBe(false);
    expect(urls.some((u) => u.includes('genius.com'))).toBe(false);
    expect(urls.some((u) => u.includes('test-0k.onrender.com'))).toBe(true);
  });
});