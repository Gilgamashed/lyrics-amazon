import { getBridgeHttpUrl } from './bridgeService';

/**
 * Single egress point for all lyrics-provider network I/O.
 *
 * Remote lyrics sources (Genius, LRCLIB) do not always send permissive CORS
 * headers, so a webview/browser `fetch` is blocked even though the request
 * itself is valid. To defeat that we proxy through the local companion bridge
 * (`GET ${bridge}/fetch?url=...`), which performs the request server-side and
 * reflects the caller's localhost/Tauri origin via its CORS layer.
 *
 * Strategy: try the direct request first (works in Node/smoke, and for sources
 * that do send `Access-Control-Allow-Origin`), then transparently fall back to
 * the bridge proxy when the direct request is rejected (CORS/network/offline).
 */
export function bridgeProxyUrl(url: string): string {
  return `${getBridgeHttpUrl()}/fetch?url=${encodeURIComponent(url)}`;
}

export async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, init);
    return response;
  } catch (directError) {
    // Do not retry when the caller aborted (timeout): the signal is spent and a
    // second attempt can never succeed.
    if (init?.signal?.aborted) throw directError;
    try {
      const response = await fetch(bridgeProxyUrl(url), { signal: init?.signal });
      return response;
    } catch {
      throw directError;
    }
  }
}
