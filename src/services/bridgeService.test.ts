import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NowPlaying } from '../types/lyrics';
import {
  createBridgeClient,
  fetchNowPlaying,
  getBridgeHttpUrl,
  getBridgeWsUrl,
} from './bridgeService';

const PLAYING: NowPlaying = {
  source: 'Amazon Music',
  title: 'Test Track',
  artist: 'Someone',
  album: 'Album',
  durationMs: 12_000,
  positionMs: 500,
  isPlaying: true,
};

describe('getBridgeHttpUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to the fixed port when unset', () => {
    expect(getBridgeHttpUrl()).toBe('http://127.0.0.1:48765');
  });

  it('uses VITE_BRIDGE_URL trimmed and without a trailing slash', () => {
    vi.stubEnv('VITE_BRIDGE_URL', '  https://example.com/  ');
    expect(getBridgeHttpUrl()).toBe('https://example.com');
  });

  it('ignores a blank env var', () => {
    vi.stubEnv('VITE_BRIDGE_URL', '   ');
    expect(getBridgeHttpUrl()).toBe('http://127.0.0.1:48765');
  });
});

describe('getBridgeWsUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('maps http to ws and https to wss', () => {
    vi.stubEnv('VITE_BRIDGE_URL', 'http://localhost:48765');
    expect(getBridgeWsUrl()).toBe('ws://localhost:48765/ws');

    vi.stubEnv('VITE_BRIDGE_URL', 'https://example.com');
    expect(getBridgeWsUrl()).toBe('wss://example.com/ws');
  });

  it('falls back to appending /ws for unrecognised schemes', () => {
    vi.stubEnv('VITE_BRIDGE_URL', 'tauri://localhost');
    expect(getBridgeWsUrl()).toBe('tauri://localhost/ws');
  });
});

describe('fetchNowPlaying', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => PLAYING });
    await expect(fetchNowPlaying()).resolves.toEqual(PLAYING);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:48765/now-playing');
  });

  it('returns null on non-2xx responses', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchNowPlaying()).resolves.toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('ECONNREFUSED'));
    await expect(fetchNowPlaying()).resolves.toBeNull();
  });

  it('aborts after the timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );

    const pending = fetchNowPlaying(1500);
    await vi.advanceTimersByTimeAsync(1600);
    await expect(pending).resolves.toBeNull();
  });
});

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static throwOnConstruct = false;

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    if (MockWebSocket.throwOnConstruct) {
      throw new Error('WebSocket unavailable');
    }
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  static last(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  sendMessage(data: unknown) {
    this.onmessage?.({ data });
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  fail() {
    this.onerror?.();
  }
}

describe('createBridgeClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    MockWebSocket.throwOnConstruct = false;
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects to the bridge websocket and reports state transitions', () => {
    const states: string[] = [];
    const client = createBridgeClient({ onNowPlaying: vi.fn(), onConnectionChange: (s) => states.push(s) });

    client.start();
    expect(states).toEqual(['connecting']);
    expect(MockWebSocket.last().url).toBe('ws://127.0.0.1:48765/ws');

    MockWebSocket.last().open();
    expect(states).toEqual(['connecting', 'connected']);
    expect(client).toBeDefined();
  });

  it('forwards only valid text frames', () => {
    const onNowPlaying = vi.fn();
    const client = createBridgeClient({ onNowPlaying });
    client.start();
    const ws = MockWebSocket.last();
    ws.open();

    ws.sendMessage('not json');
    ws.sendMessage(JSON.stringify({ source: 123 }));
    ws.sendMessage(42);
    ws.sendMessage(JSON.stringify(PLAYING));
    ws.sendMessage(JSON.stringify({ ...PLAYING, source: 'Amazon Music' }));

    expect(onNowPlaying).toHaveBeenCalledTimes(2);
    expect(onNowPlaying).toHaveBeenLastCalledWith(PLAYING);
  });

  it('resets the backoff after a successful connect', async () => {
    const states: string[] = [];
    const client = createBridgeClient({ onNowPlaying: vi.fn(), onConnectionChange: (s) => states.push(s) });
    client.start();
    MockWebSocket.last().open();
    expect(states).toEqual(['connecting', 'connected']);

    // Drop after the first connect: backoff escalates 1000 -> 2000.
    MockWebSocket.instances[0].close();
    expect(states.at(-1)).toBe('disconnected');

    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(states).toEqual(['connecting', 'connected', 'disconnected', 'connecting']);

    // Reconnect succeeds and resets the delay back to the base.
    MockWebSocket.last().open();
    MockWebSocket.last().close();
    expect(states.at(-1)).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('caps the reconnect delay at the maximum', async () => {
    const client = createBridgeClient({ onNowPlaying: vi.fn() });
    client.start();

    MockWebSocket.instances[0].open();
    MockWebSocket.instances[0].close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1].open();
    MockWebSocket.instances[1].close();
    await vi.advanceTimersByTimeAsync(2000);
    expect(MockWebSocket.instances).toHaveLength(3);

    MockWebSocket.instances[2].open();
    MockWebSocket.instances[2].close();
    await vi.advanceTimersByTimeAsync(4000);
    expect(MockWebSocket.instances).toHaveLength(4);

    MockWebSocket.instances[3].open();
    MockWebSocket.instances[3].close();
    await vi.advanceTimersByTimeAsync(8000);
    expect(MockWebSocket.instances).toHaveLength(5);

    MockWebSocket.instances[4].open();
    MockWebSocket.instances[4].close();
    await vi.advanceTimersByTimeAsync(15000);
    expect(MockWebSocket.instances).toHaveLength(6);

    MockWebSocket.instances[5].open();
    MockWebSocket.instances[5].close();
    await vi.advanceTimersByTimeAsync(15000);
    expect(MockWebSocket.instances).toHaveLength(7);
  });

  it('reconnects when the constructor throws', async () => {
    const client = createBridgeClient({ onNowPlaying: vi.fn(), onConnectionChange: vi.fn() });
    MockWebSocket.throwOnConstruct = true;
    client.start();
    MockWebSocket.throwOnConstruct = false;

    // No socket was created; only the reconnect path matters.
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.last().url).toBe('ws://127.0.0.1:48765/ws');
  });

  it('treats an error as a close', () => {
    const states: string[] = [];
    const client = createBridgeClient({ onNowPlaying: vi.fn(), onConnectionChange: (s) => states.push(s) });
    client.start();
    const ws = MockWebSocket.last();
    ws.open();
    ws.fail();

    expect(states).toEqual(['connecting', 'connected', 'disconnected']);
  });

  it('stop() cancels the reconnect timer and closes the socket', async () => {
    const states: string[] = [];
    const client = createBridgeClient({ onNowPlaying: vi.fn(), onConnectionChange: (s) => states.push(s) });
    client.start();
    const ws = MockWebSocket.last();
    ws.open();
    ws.close();
    expect(states.at(-1)).toBe('disconnected');

    client.stop();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});