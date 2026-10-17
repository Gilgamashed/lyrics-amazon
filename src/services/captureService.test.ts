import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturePlayback, DEFAULT_CAPTURE_MS } from './captureService';

describe('capturePlayback', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs the capture route and returns the audio blob', async () => {
    const blob = new Blob(['wav-bytes'], { type: 'audio/wav' });
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => blob } as Response);

    const result = await capturePlayback(5000);
    expect(result).toBe(blob);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/capture?duration_ms=5000');
    expect(init.method).toBe('POST');
  });

  it('uses the default capture window when none is given', async () => {
    const blob = new Blob(['x']);
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => blob } as Response);

    await capturePlayback();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain(`duration_ms=${DEFAULT_CAPTURE_MS}`);
  });

  it('throws when the bridge reports a failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 501 } as Response);
    await expect(capturePlayback()).rejects.toThrow(/capture failed \(501\)/i);
  });
});
