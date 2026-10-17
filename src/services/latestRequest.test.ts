import { describe, expect, it } from 'vitest';
import { LatestRequest } from './latestRequest';

describe('LatestRequest', () => {
  it('returns monotonically increasing ids', () => {
    const latest = new LatestRequest();
    const first = latest.start();
    const second = latest.start();
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('marks only the newest id as current', () => {
    const latest = new LatestRequest();
    const first = latest.start();
    expect(latest.isCurrent(first.id)).toBe(true);
    const second = latest.start();
    expect(latest.isCurrent(first.id)).toBe(false);
    expect(latest.isCurrent(second.id)).toBe(true);
  });

  it('aborts the superseded request when a new one starts', () => {
    const latest = new LatestRequest();
    const first = latest.start();
    expect(first.signal.aborted).toBe(false);
    latest.start();
    expect(first.signal.aborted).toBe(true);
  });

  it('cancel aborts the in-flight request and invalidates its id', () => {
    const latest = new LatestRequest();
    const handle = latest.start();
    latest.cancel();
    expect(handle.signal.aborted).toBe(true);
    expect(latest.isCurrent(handle.id)).toBe(false);
  });

  it('cancel is safe with no in-flight request', () => {
    const latest = new LatestRequest();
    expect(() => latest.cancel()).not.toThrow();
  });
});
