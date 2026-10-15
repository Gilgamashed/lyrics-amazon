import { afterEach, describe, expect, it, vi } from 'vitest';
import { Song } from '../../types/lyrics';
import { fetchGenius } from './genius';
import { fetchLrcLib } from './lrclib';

const SONG: Song = {
  id: 's-1',
  title: 'Yesterday',
  artist: 'The Beatles',
  album: 'Help!',
  albumArt: '',
  durationMs: 125_000,
};

function jsonResponse(payload: unknown, ok = true, status = ok ? 200 : 404): Response {
  return { ok, status, json: async () => payload } as Response;
}

function textResponse(text: string, ok = true, status = ok ? 200 : 404): Response {
  return { ok, status, text: async () => text } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Genius returns hits nested under response.sections[].hits[] on the live API.
const geniusSearchPayload = {
  response: {
    sections: [
      {
        type: 'song',
        hits: [
          {
            result: {
              title: 'Yesterday',
              primary_artist: { name: 'The Beatles' },
              path: '/The-beatles-yesterday-lyrics',
            },
          },
        ],
      },
    ],
  },
};

// Mirrors the live page: a translations/description widget prefixes the first
// lyrics block, blocks are nested-div wrapped, and in-read ads split the song
// across multiple data-lyrics-container elements.
const geniusPageHtml =
  '<div data-lyrics-container="true" class="Lyrics__Container">' +
  '99 ContributorsTranslationsTürkçeEspañolFrançaisYesterday Lyrics' +
  ' The most covered song. Read More' +
  '<br/><br/>[Verse 1]<br/>Yesterday, all my troubles seemed so far away<br/>' +
  "Now it looks as though they&apos;re here to stay" +
  '</div>' +
  '<div class="Ad__Slot"><div id="div-gpt-ad-desktop_song_lyrics_inread-1"></div></div>' +
  '<div data-lyrics-container="true" class="Lyrics__Container">' +
  "[Chorus]<br/>Why she had to go<br/>I don't know, she wouldn&apos;t say" +
  '</div>';

describe('fetchGenius', () => {
  it('reads hits from response.sections[].hits[], scrapes the page, and strips the widget', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(geniusSearchPayload))
      .mockResolvedValueOnce(textResponse(geniusPageHtml));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius(SONG);
    expect(result.provider).toBe('Genius');
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toContain('[Verse 1]');
    expect(result.plainLyrics).toContain('all my troubles');
    expect(result.plainLyrics).toContain("[Chorus]");
    expect(result.plainLyrics).toContain("Why she had to go");
    expect(result.plainLyrics).not.toContain('Contributors');
    expect(result.plainLyrics).not.toContain('Read More');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still accepts the legacy top-level response.hits shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ response: { hits: geniusSearchPayload.response.sections[0].hits } })
      )
      .mockResolvedValueOnce(textResponse(geniusPageHtml));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius(SONG);
    expect(result.plainLyrics).toContain('all my troubles');
  });

  it('returns empty when the search yields no hits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ response: { sections: [{ hits: [] }] } }))
    );
    const result = await fetchGenius(SONG);
    expect(result.plainLyrics).toBeUndefined();
  });

  it('reads hits directly from response.hits[]', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          response: {
            hits: [
              {
                result: {
                  title: 'Yesterday',
                  primary_artist: { name: 'The Beatles' },
                  path: '/The-beatles-yesterday-lyrics',
                },
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(textResponse(geniusPageHtml));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius(SONG);
    expect(result.plainLyrics).toContain('all my troubles');
  });

  it('returns empty when the search response carries no hits at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ response: {} })));
    const result = await fetchGenius(SONG);
    expect(result.plainLyrics).toBeUndefined();
  });

  it('returns empty when the best hit has no page path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          response: {
            hits: [{ result: { title: 'Yesterday', primary_artist: { name: 'The Beatles' } } }],
          },
        })
      )
    );
    const result = await fetchGenius(SONG);
    expect(result.plainLyrics).toBeUndefined();
  });

  it('returns empty on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchGenius(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBeUndefined();
  });
});

describe('fetchLrcLib', () => {
  it('returns parsed synchronized lyrics from /api/get', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          syncedLyrics: '[00:12.00] Yesterday\n[00:15.00] All my troubles',
          plainLyrics: 'Yesterday\nAll my troubles',
        })
      )
    );
    const result = await fetchLrcLib(SONG);
    expect(result.provider).toBe('LRCLIB');
    expect(result.hasSync).toBe(true);
    expect(result.syncedLyrics).toHaveLength(2);
  });

  it('returns plain-only lyrics when no synced track exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ plainLyrics: 'Just plain lyrics here' }))
    );
    const result = await fetchLrcLib(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBe('Just plain lyrics here');
  });

  it('falls back to /api/search and matches the closest duration when /api/get misses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 1, duration: 200, syncedLyrics: '[00:01.00] wrong track' },
          {
            id: 2,
            duration: 126,
            syncedLyrics: '[00:01.00] Right track',
            plainLyrics: 'Right track',
          },
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.hasSync).toBe(true);
    expect(result.syncedLyrics?.[0].text).toBe('Right track');
    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes('/api/get'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/api/search'))).toBe(true);
  });

  it('retries once after a 429 and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 429))
      .mockResolvedValueOnce(jsonResponse({ syncedLyrics: '[00:01.00] recovered' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.hasSync).toBe(true);
    expect(result.syncedLyrics?.[0].text).toBe('recovered');
  });

  it('returns empty when both /api/get and /api/search fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 404)));
    const result = await fetchLrcLib(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBeUndefined();
  });

  it('ignores a /api/get payload that carries no lyrics and falls through', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}, false, 404));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBeUndefined();
  });

  it('picks a search result by normalized name when no duration matches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 1, duration: 400, trackName: 'Yesterday', artistName: 'The Beatles', syncedLyrics: '[00:01.00] Named track' },
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.syncedLyrics?.[0].text).toBe('Named track');
  });

  it('falls back to the first synced search result when the name does not match', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 1, duration: 400, trackName: 'Other', artistName: 'Someone', syncedLyrics: '[00:02.00] Fallback synced' },
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.syncedLyrics?.[0].text).toBe('Fallback synced');
  });
});
