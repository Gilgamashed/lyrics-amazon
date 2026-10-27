import { NowPlaying } from '../types/lyrics';
import { debugLog } from './debugConsole';

export type BridgeConnectionState = 'connecting' | 'connected' | 'disconnected';

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:48765';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export function getBridgeHttpUrl(): string {
  const envUrl = import.meta.env?.VITE_BRIDGE_URL;
  const base = envUrl && envUrl.trim() ? envUrl.trim() : DEFAULT_BRIDGE_URL;
  return base.replace(/\/+$/, '');
}

export function getBridgeWsUrl(): string {
  const httpUrl = getBridgeHttpUrl();
  if (httpUrl.startsWith('https://')) return `wss://${httpUrl.slice('https://'.length)}/ws`;
  if (httpUrl.startsWith('http://')) return `ws://${httpUrl.slice('http://'.length)}/ws`;
  return `${httpUrl}/ws`;
}

export async function fetchNowPlaying(timeoutMs = 1500): Promise<NowPlaying | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${getBridgeHttpUrl()}/now-playing`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as NowPlaying;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface BridgeClientOptions {
  onNowPlaying: (nowPlaying: NowPlaying) => void;
  onConnectionChange?: (state: BridgeConnectionState) => void;
}

export interface BridgeClient {
  start: () => void;
  stop: () => void;
}

export function createBridgeClient(options: BridgeClientOptions): BridgeClient {
  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer: number | null = null;
  // The bridge republishes on every poll tick (the playback position moves),
  // so only identity changes are worth recording.
  let lastIdentity: string | null = null;

  const connect = () => {
    if (stopped) return;
    options.onConnectionChange?.('connecting');
    debugLog('bridge', 'bridge.connecting', { url: getBridgeWsUrl() });

    try {
      socket = new WebSocket(getBridgeWsUrl());
    } catch (error) {
      debugLog('bridge', 'bridge.socket-error', {
        error: error instanceof Error ? error.message : String(error),
      }, 'error');
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      reconnectDelay = RECONNECT_BASE_MS;
      options.onConnectionChange?.('connected');
      debugLog('bridge', 'bridge.connected');
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data) as NowPlaying;
        if (parsed && typeof parsed === 'object' && typeof parsed.source === 'string') {
          // The raw reading, exactly as the native bridge reported it - the
          // debug terminal shows this next to the sanitization decision.
          // Only identity changes are recorded so the buffer is not flooded
          // with per-second position updates.
          const identity = [
            parsed.title ?? '',
            parsed.artist ?? '',
            parsed.album ?? '',
            parsed.isPlaying ? 'playing' : 'paused',
          ].join('|');
          if (identity !== lastIdentity) {
            lastIdentity = identity;
            debugLog('bridge', 'now-playing', {
              source: parsed.source,
              appId: parsed.appId,
              title: parsed.title,
              artist: parsed.artist,
              album: parsed.album,
              durationMs: parsed.durationMs,
              positionMs: parsed.positionMs,
              isPlaying: parsed.isPlaying,
              isAmazon: parsed.isAmazon,
              hasAlbumArt: Boolean(parsed.albumArt),
            });
          }
          options.onNowPlaying(parsed);
        }
      } catch {
        // Ignore malformed frames and keep the stream alive.
        debugLog('bridge', 'now-playing.parse-error', {}, 'warn');
      }
    };

    socket.onclose = () => {
      socket = null;
      options.onConnectionChange?.('disconnected');
      debugLog('bridge', 'bridge.disconnected', { retryInMs: reconnectDelay }, 'warn');
      scheduleReconnect();
    };

    socket.onerror = () => {
      debugLog('bridge', 'bridge.error', {}, 'warn');
      socket?.close();
    };
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  };

  return {
    start: () => {
      stopped = false;
      connect();
    },
    stop: () => {
      stopped = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      socket = null;
    },
  };
}