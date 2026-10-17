import { describe, expect, it } from 'vitest';
import {
  DISPLAY_FALLBACK_DURATION_MS,
  ClockAnchor,
  nextClockPositionMs,
  resolveDuration,
} from './playbackClock';

function anchor(overrides: Partial<ClockAnchor> = {}): ClockAnchor {
  return {
    positionMs: 0,
    atMs: 1_000,
    playing: true,
    durationMs: 0,
    durationAuthoritative: false,
    ...overrides,
  };
}

describe('nextClockPositionMs', () => {
  it('returns the frozen position while paused', () => {
    expect(nextClockPositionMs(anchor({ playing: false, positionMs: 42_000 }), 99_999)).toBe(42_000);
  });

  it('interpolates with wall-clock elapsed time while playing', () => {
    expect(nextClockPositionMs(anchor({ positionMs: 1_000, atMs: 1_000 }), 3_500)).toBe(3_500);
  });

  it('free-runs past the 180s display fallback when duration is not authoritative', () => {
    const a = anchor({
      positionMs: DISPLAY_FALLBACK_DURATION_MS - 1_000,
      atMs: 0,
      durationMs: DISPLAY_FALLBACK_DURATION_MS,
      durationAuthoritative: false,
    });
    // 60s past the previous position: must advance well beyond 180s.
    expect(nextClockPositionMs(a, 60_000)).toBe(DISPLAY_FALLBACK_DURATION_MS + 59_000);
    expect(nextClockPositionMs(a, 60_000)).toBeGreaterThan(DISPLAY_FALLBACK_DURATION_MS);
  });

  it('clamps only when the duration is authoritative', () => {
    const a = anchor({
      positionMs: 179_000,
      atMs: 0,
      durationMs: 180_000,
      durationAuthoritative: true,
    });
    expect(nextClockPositionMs(a, 10_000)).toBe(180_000);
  });

  it('ignores a non-positive authoritative duration', () => {
    const a = anchor({ positionMs: 5_000, atMs: 0, durationMs: 0, durationAuthoritative: true });
    expect(nextClockPositionMs(a, 1_000)).toBe(6_000);
  });
});

describe('resolveDuration', () => {
  it('treats a positive duration as authoritative', () => {
    expect(resolveDuration(200_000)).toEqual({ durationMs: 200_000, durationAuthoritative: true });
  });

  it.each([null, undefined, 0, -5])(
    'falls back to the display-only 180s for a missing/zero/negative value (%s)',
    (value) => {
      expect(resolveDuration(value)).toEqual({
        durationMs: DISPLAY_FALLBACK_DURATION_MS,
        durationAuthoritative: false,
      });
    }
  );
});
