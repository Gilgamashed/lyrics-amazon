import { afterEach, describe, expect, it, vi } from 'vitest';
import { Song } from '../../types/lyrics';
import { fetchGenius } from './genius';
import { fetchLrcLib } from './lrclib';
import { fetchLyrica } from './lyrica';

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

  it('returns not-found without a request when there is no searchable identity', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius({ ...SONG, title: '', artist: 'Unknown Artist' });
    expect(result.outcome).toBe('not-found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('continues past a non-transient lyrics-page miss', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/search')) return Promise.resolve(jsonResponse(geniusSearchPayload));
      return Promise.resolve(jsonResponse({}, false, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius(SONG);
    expect(result.outcome).toBe('not-found');
    expect(result.plainLyrics).toBeUndefined();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
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

  it('classifies a transient lyrics-page failure as transient-error', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/search')) return Promise.resolve(jsonResponse(geniusSearchPayload));
      return Promise.resolve(jsonResponse({}, false, 503));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius(SONG);
    expect(result.outcome).toBe('transient-error');
    expect(result.plainLyrics).toBeUndefined();
  }, 20_000);

  it('returns not-found when the page has no lyrics container', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/search')) return Promise.resolve(jsonResponse(geniusSearchPayload));
      return Promise.resolve(textResponse('<html><body>No lyrics here</body></html>'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius(SONG);
    expect(result.outcome).toBe('not-found');
    expect(result.plainLyrics).toBeUndefined();
  });

  it('rejects every hit that fails the identity gate (no hits[0] fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          response: {
            hits: [
              {
                result: {
                  title: 'A Totally Different Song',
                  primary_artist: { name: 'Someone Else' },
                  path: '/someone-else-different-lyrics',
                },
              },
            ],
          },
        })
      )
    );
    const result = await fetchGenius(SONG);
    expect(result.plainLyrics).toBeUndefined();
    // Spec 17, W3: an all-rejected search is a gate rejection, not a clean
    // "not found" - the UI must be able to say so.
    expect(result.outcome).toBe('gate-rejected');
  });

  it('selects a decorated lookalike that passes the identity gate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          response: {
            hits: [
              {
                result: {
                  title: 'Yesterday (Remastered 2011)',
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

  // Spec 17, W4: with an unknown artist the artist is not scored, so the
  // ranking must pick the closest *title* instead of the first candidate.
  it('ranks a title-only query by the title match, not by hit order', async () => {
    const searchPayload = {
      response: {
        sections: [
          {
            type: 'song',
            hits: [
              {
                result: {
                  title: 'Breeds',
                  primary_artist: { name: 'Nirvana' },
                  path: '/Nirvana-breeds-lyrics',
                },
              },
              {
                result: {
                  title: 'Breed',
                  primary_artist: { name: 'Nirvana' },
                  path: '/Nirvana-breed-lyrics',
                },
              },
            ],
          },
        ],
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(searchPayload))
      .mockResolvedValueOnce(textResponse(geniusPageHtml));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius({
      ...SONG,
      title: 'Breed',
      artist: 'Unknown Artist',
    });
    expect(result.outcome).toBe('found');
    expect(fetchMock.mock.calls[1][0]).toBe('https://genius.com/Nirvana-breed-lyrics');
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

  it('returns not-found without a request when there is no searchable identity', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib({ ...SONG, title: '', artist: 'Unknown Artist' });
    expect(result.outcome).toBe('not-found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns not-found when the search answer is an empty list', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/get')) return Promise.resolve(jsonResponse({}, false, 404));
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.outcome).toBe('not-found');
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

  it('rejects every search result that fails the identity gate (no wrong-song fallback)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 1, duration: 400, trackName: 'Completely Different', artistName: 'Someone Else', syncedLyrics: '[00:02.00] Wrong song' },
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBeUndefined();
  });

  it('accepts a decorated lookalike that passes the identity gate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 1,
            duration: 400,
            trackName: 'Yesterday (Remastered 2011)',
            artistName: 'The Beatles',
            syncedLyrics: '[00:02.00] Decorated match',
          },
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.syncedLyrics?.[0].text).toBe('Decorated match');
  });

  // Spec 17, W3: a transient provider outage must be retried, and it must
  // never be reported as "lyrics not found".
  it('retries a 503 and succeeds (spec 17 W3)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(jsonResponse({ syncedLyrics: '[00:01.00] recovered after 503' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.outcome).toBe('found');
    expect(result.syncedLyrics?.[0].text).toBe('recovered after 503');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('classifies an unrecoverable 503 as a transient error, not as not-found', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 503));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.outcome).toBe('transient-error');
    expect(result.plainLyrics).toBeUndefined();
  }, 20_000);

  it('keeps searching after a transient /api/get failure', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/get')) return Promise.resolve(jsonResponse({}, false, 503));
      return Promise.resolve(
        jsonResponse([
          {
            id: 1,
            duration: 126,
            trackName: 'Yesterday',
            artistName: 'The Beatles',
            syncedLyrics: '[00:01.00] From search',
          },
        ])
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.outcome).toBe('found');
    expect(result.syncedLyrics?.[0].text).toBe('From search');
  }, 20_000);

  it('never calls /api/get when the player reports no duration', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 1,
            duration: 126,
            trackName: 'Yesterday',
            artistName: 'The Beatles',
            syncedLyrics: '[00:01.00] No duration needed',
          },
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib({ ...SONG, durationMs: 0 });
    expect(result.outcome).toBe('found');
    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes('/api/get'))).toBe(false);
    expect(calledUrls.some((u) => u.includes('/api/search'))).toBe(true);
  });

  it('never calls /api/get and never puts the unknown artist on the wire', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 1,
            duration: 126,
            trackName: 'Yesterday',
            artistName: 'The Beatles',
            syncedLyrics: '[00:01.00] Title only',
          },
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib({ ...SONG, artist: 'Unknown Artist' });
    expect(result.outcome).toBe('found');
    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes('/api/get'))).toBe(false);
    expect(calledUrls.every((u) => !u.includes('unknown'))).toBe(true);
  });

  it('tries the title-only variant when the full query finds nothing', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/get')) return Promise.resolve(jsonResponse({}, false, 404));
      if (url.includes('q=yesterday%20the%20beatles')) {
        return Promise.resolve(jsonResponse([], false, 200));
      }
      return Promise.resolve(
        jsonResponse([
          {
            id: 1,
            duration: 126,
            trackName: 'Yesterday',
            artistName: 'The Beatles',
            syncedLyrics: '[00:01.00] Title only hit',
          },
        ])
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.outcome).toBe('found');
    expect(result.syncedLyrics?.[0].text).toBe('Title only hit');
    const searchUrls = fetchMock.mock.calls
      .map((c) => c[0] as string)
      .filter((u) => u.includes('/api/search'));
    expect(searchUrls.length).toBeGreaterThan(1);
    expect(searchUrls.some((u) => u.includes('q=yesterday%20the%20beatles'))).toBe(true);
    expect(searchUrls.some((u) => u.includes('q=yesterday') && !u.includes('the%20beatles'))).toBe(
      true
    );
  });

  it('classifies an all-rejected search as gate-rejected, not not-found', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/get')) return Promise.resolve(jsonResponse({}, false, 404));
      return Promise.resolve(
        jsonResponse([
          {
            id: 1,
            duration: 126,
            trackName: 'A Totally Different Song',
            artistName: 'Someone Else',
            syncedLyrics: '[00:01.00] Wrong song',
          },
        ])
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLrcLib(SONG);
    expect(result.outcome).toBe('gate-rejected');
    expect(result.plainLyrics).toBeUndefined();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it.each([3601, 7200])(
    'never calls /api/get for a %s-second duration (LRCLIB requires 1..3600)',
    async (durationSeconds) => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/get')) return Promise.resolve(jsonResponse({}, false, 404));
        return Promise.resolve(
          jsonResponse([
            {
              id: 1,
              duration: 126,
              trackName: 'Yesterday',
              artistName: 'The Beatles',
              syncedLyrics: '[00:01.00] Long track search hit',
            },
          ])
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchLrcLib({ ...SONG, durationMs: durationSeconds * 1000 });
      expect(result.outcome).toBe('found');
      const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
      expect(calledUrls.some((u) => u.includes('/api/get'))).toBe(false);
      expect(calledUrls.some((u) => u.includes('/api/search'))).toBe(true);
    }
  );
});

describe('fetchLyrica', () => {
  it('returns not-found without a request when there is no searchable identity', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLyrica({ ...SONG, title: '', artist: 'Unknown Artist' });
    expect(result.outcome).toBe('not-found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies an all-rejected echoed identity as gate-rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: 'success',
          data: {
            title: 'A Totally Different Song',
            artist: 'Someone Else',
            lyrics: 'Wrong song lyrics',
          },
        })
      )
    );

    const result = await fetchLyrica(SONG);
    expect(result.outcome).toBe('gate-rejected');
    expect(result.plainLyrics).toBeUndefined();
  });

  it('returns the synced lyrics when the echoed identity matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: 'success',
          data: {
            title: 'Yesterday',
            artist: 'The Beatles',
            lyrics: 'Yesterday\nAll my troubles',
            timed_lyrics: [
              { start_time: 0, end_time: 1000, text: 'Yesterday' },
              { start_time: 1000, end_time: 2000, text: 'All my troubles' },
            ],
          },
        })
      )
    );

    const result = await fetchLyrica(SONG);
    expect(result.outcome).toBe('found');
    expect(result.hasSync).toBe(true);
    expect(result.syncedLyrics?.[0].text).toBe('Yesterday');
  });
});
