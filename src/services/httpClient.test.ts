import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeProxyUrl, httpFetch } from './httpClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('httpFetch', () => {
  it('returns the direct response when the direct request succeeds', async () => {
    const response = { ok: true, status: 200 } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const out = await httpFetch('https://genius.com/api/search/song?q=x');

    expect(out).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://genius.com/api/search/song?q=x');
  });

  it('falls back to the bridge proxy when the direct request is CORS-blocked', async () => {
    const proxied = { ok: true, status: 200 } as Response;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(proxied);
    vi.stubGlobal('fetch', fetchMock);

    const url = 'https://genius.com/The-beatles-yesterday-lyrics';
    const out = await httpFetch(url);

    expect(out).toBe(proxied);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(bridgeProxyUrl(url));
    expect(fetchMock.mock.calls[1][0]).toContain(
      'url=https%3A%2F%2Fgenius.com%2FThe-beatles-yesterday-lyrics'
    );
  });

  it('rethrows the direct error when the bridge fallback also fails', async () => {
    const directError = new TypeError('blocked');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(directError));

    await expect(httpFetch('https://genius.com/x')).rejects.toBe(directError);
  });
});
