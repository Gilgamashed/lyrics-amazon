/**
 * Pure playback-clock rule for the karaoke highlight.
 *
 * The clock interpolates between authoritative bridge snapshots. It clamps the
 * interpolated position **only** when the duration is authoritative (a positive
 * SMTC `EndTime`); with no real timeline the clock free-runs so karaoke keeps
 * advancing past the 180 s display fallback instead of freezing at 3:00.
 */

/** Display-only fallback duration for a track whose real length is unknown. */
export const DISPLAY_FALLBACK_DURATION_MS = 180_000;

export interface ClockAnchor {
  positionMs: number;
  atMs: number;
  playing: boolean;
  /** Display length; may be the 180 s fallback. Never clamps unless authoritative. */
  durationMs: number;
  /** True only when the bridge reported a real, positive EndTime. */
  durationAuthoritative: boolean;
}

/**
 * Interpolates the current playback position for a given wall-clock time.
 * Clamps against `durationMs` only when `durationAuthoritative` is set.
 */
export function nextClockPositionMs(anchor: ClockAnchor, nowMs: number): number {
  if (!anchor.playing) return anchor.positionMs;

  const next = anchor.positionMs + (nowMs - anchor.atMs);
  if (anchor.durationAuthoritative && anchor.durationMs > 0 && next > anchor.durationMs) {
    return anchor.durationMs;
  }
  return next;
}

/**
 * Derives the display duration and clamp-authority from a bridge reading.
 * A missing/zero/negative duration yields the display fallback with authority
 * `false`; a positive duration is authoritative and clamps.
 */
export function resolveDuration(
  rawDurationMs: number | null | undefined
): { durationMs: number; durationAuthoritative: boolean } {
  if (typeof rawDurationMs === 'number' && rawDurationMs > 0) {
    return { durationMs: rawDurationMs, durationAuthoritative: true };
  }
  return { durationMs: DISPLAY_FALLBACK_DURATION_MS, durationAuthoritative: false };
}
