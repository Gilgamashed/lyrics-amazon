import { getBridgeHttpUrl } from './bridgeService';

/** Default capture window: long enough to align several lines quickly. */
export const DEFAULT_CAPTURE_MS = 15_000;

/**
 * Records the current system playback (WASAPI loopback on the Rust bridge) and
 * returns the captured audio as a WAV `Blob`. The recording is local and
 * temporary; audio only leaves the machine when the caller later posts it to the
 * user-configured alignment endpoint.
 *
 * Throws when the bridge is unreachable or the platform cannot capture.
 */
export async function capturePlayback(
  durationMs: number = DEFAULT_CAPTURE_MS,
  signal?: AbortSignal
): Promise<Blob> {
  const url = `${getBridgeHttpUrl()}/capture?duration_ms=${encodeURIComponent(String(durationMs))}`;
  const response = await fetch(url, { method: 'POST', signal });
  if (!response.ok) {
    throw new Error(`Audio capture failed (${response.status}).`);
  }
  return response.blob();
}
