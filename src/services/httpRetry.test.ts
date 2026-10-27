import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_ATTEMPTS,
  fetchWithRetry,
  isRetryableStatus,
  RETRYABLE_STATUS,
} from './httpRetry';

function response(status: number): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => ({}) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('isRetryableStatus', () => {
  it('treats the throttling and server-overload statuses as retryable', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
  });

  it('does not retry a missing song or a bad request', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });

  it('exposes the retryable set', () => {
    expect([...RETRYABLE_STATUS].sort((a, b) => a - b)).toEqual([429, 500, 502, 503, 504]);
  });
});

describe('fetchWithRetry', () => {
  it('returns the first successful response without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchWithRetry('https://example.test/a', { label: 'test' });

    expect(report.response?.status).toBe(200);
    expect(report.attempts).toBe(1);
    expect(report.transient).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(404));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchWithRetry('https://example.test/a', { label: 'test' });

    expect(report.response?.status).toBe(404);
    expect(report.attempts).toBe(1);
    expect(report.transient).toBe(false);
  });

  it('retries a 503 and reports the recovery', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchWithRetry('https://example.test/a', {
      label: 'test',
      backoffMs: [1],
    });

    expect(report.response?.status).toBe(200);
    expect(report.attempts).toBe(2);
    expect(report.transient).toBe(false);
  });

  it('gives up after the bounded number of attempts and reports it as transient', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(503));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchWithRetry('https://example.test/a', {
      label: 'test',
      backoffMs: [1],
    });

    expect(report.attempts).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(report.response?.status).toBe(503);
    expect(report.transient).toBe(true);
  });

  it('reports a network error as transient after the last attempt', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchWithRetry('https://example.test/a', {
      label: 'test',
      backoffMs: [1],
    });

    expect(report.attempts).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(report.response).toBeNull();
    expect(report.transient).toBe(true);
    expect(report.error).toContain('network down');
  });

  it('stops immediately when the request was aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn().mockResolvedValue(response(503));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchWithRetry('https://example.test/a', {
      label: 'test',
      signal: controller.signal,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.attempts).toBe(0);
  });

  it('honours a custom attempt budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(503));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchWithRetry('https://example.test/a', {
      label: 'test',
      maxAttempts: 1,
      backoffMs: [1],
    });

    expect(report.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns immediately when the signal aborts before the backoff starts', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation(async () => {
      controller.abort();
      return response(503);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchWithRetry('https://example.test/a', {
      label: 'test',
      backoffMs: [60_000],
      signal: controller.signal,
    });

    expect(report.response).toBeNull();
    expect(report.attempts).toBe(1);
    expect(report.transient).toBe(true);
  });

  it('wakes from the backoff when the signal aborts mid-sleep', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(response(503));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchWithRetry('https://example.test/a', {
      label: 'test',
      backoffMs: [60_000],
      signal: controller.signal,
    });

    // Let the first response resolve and the retry enter its backoff.
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    const report = await pending;
    expect(report.response).toBeNull();
    expect(report.attempts).toBe(1);
    expect(report.transient).toBe(true);
  });
});
