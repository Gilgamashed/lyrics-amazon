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

function jsonResponse(payload: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 404, json: async () => payload } as Response;
}

function textResponse(text: string, ok = true): Response {
  return { ok, status: ok ? 200 : 404, text: async () => text } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGenius', () => {
  it('searches then scrapes the matching song page', async () => {
    const pageHtml =
      '<div data-lyrics-container="true">Yesterday, all my troubles seemed so far away<br/>Now it looks as though they are here to stay</div>';
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
      .mockResolvedValueOnce(textResponse(pageHtml));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGenius(SONG);
    expect(result.provider).toBe('Genius');
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toContain('all my troubles');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns empty when the search yields no hits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ response: { hits: [] } })));
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
  it('returns parsed synchronized lyrics', async () => {
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

  it('returns empty on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)));
    const result = await fetchLrcLib(SONG);
    expect(result.hasSync).toBe(false);
    expect(result.plainLyrics).toBeUndefined();
  });
});
