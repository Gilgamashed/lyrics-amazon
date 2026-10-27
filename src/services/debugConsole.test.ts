import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEBUG_MAX_EVENTS,
  buildDiagnosticsReport,
  clearDebugEvents,
  copyDiagnosticsReport,
  debugLog,
  getDebugEvents,
  isDebugConsoleEnabled,
  isPrereleaseVersion,
  subscribeDebug,
} from './debugConsole';

describe('debugConsole', () => {
  beforeEach(() => {
    clearDebugEvents();
    vi.unstubAllEnvs();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  });

  it('records an event with its scope, name, level and payload', () => {
    debugLog('provider', 'lrclib.get', { status: 503 });

    const events = getDebugEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scope: 'provider',
      event: 'lrclib.get',
      level: 'info',
    });
    expect(events[0].data).toEqual({ status: 503 });
  });

  it('omits an empty payload', () => {
    debugLog('app', 'ping', {});
    expect(getDebugEvents()[0].data).toBeUndefined();
  });

  it('keeps only the newest events once the buffer is full', () => {
    for (let index = 0; index < DEBUG_MAX_EVENTS + 25; index += 1) {
      debugLog('app', `event-${index}`);
    }

    const events = getDebugEvents();
    expect(events).toHaveLength(DEBUG_MAX_EVENTS);
    expect(events[0].event).toBe('event-25');
    expect(events[events.length - 1].event).toBe(`event-${DEBUG_MAX_EVENTS + 24}`);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDebug(listener);

    debugLog('app', 'first');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    debugLog('app', 'second');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears the buffer', () => {
    debugLog('app', 'first');
    clearDebugEvents();
    expect(getDebugEvents()).toHaveLength(0);
  });

  it('builds a diagnostics report with the version, platform and events', () => {
    debugLog('lookup', 'lookup.start', { key: 'a | b' });

    const report = JSON.parse(buildDiagnosticsReport()) as {
      appVersion: string;
      platform: Record<string, unknown>;
      counts: { total: number; byScope: Record<string, number> };
      events: Array<{ event: string; scope: string }>;
    };

    expect(report.appVersion).toBeTruthy();
    expect(report.platform).toBeDefined();
    expect(report.counts.total).toBe(1);
    expect(report.counts.byScope.lookup).toBe(1);
    expect(report.events[0]).toMatchObject({ event: 'lookup.start', scope: 'lookup' });
  });

  it('is enabled in development builds and can be forced off', () => {
    expect(isDebugConsoleEnabled()).toBe(true);

    vi.stubEnv('VITE_DEBUG_TERMINAL', '0');
    expect(isDebugConsoleEnabled()).toBe(false);

    debugLog('app', 'ignored');
    expect(getDebugEvents()).toHaveLength(0);
  });

  it('can be forced on for a build that would otherwise stay silent', () => {
    vi.stubEnv('VITE_DEBUG_TERMINAL', '1');
    expect(isDebugConsoleEnabled()).toBe(true);

    debugLog('app', 'forced');
    expect(getDebugEvents()).toHaveLength(1);
  });

  it('recognises rc, beta and alpha prerelease versions', () => {
    expect(isPrereleaseVersion('0.5.5-rc.1')).toBe(true);
    expect(isPrereleaseVersion('0.5.5-rc.2')).toBe(true);
    expect(isPrereleaseVersion('0.5.5-beta.2')).toBe(true);
    expect(isPrereleaseVersion('0.5.5-alpha')).toBe(true);
    expect(isPrereleaseVersion('0.5.5')).toBe(false);
    expect(isPrereleaseVersion('0.5.5-rc')).toBe(true);
  });

  it('gates stable and prerelease builds when the environment is injectable', () => {
    expect(isDebugConsoleEnabled({}, '0.5.5-rc.1')).toBe(true);
    expect(isDebugConsoleEnabled({}, '0.5.5-beta.2')).toBe(true);
    expect(isDebugConsoleEnabled({}, '0.5.5-alpha')).toBe(true);
    expect(isDebugConsoleEnabled({}, '0.5.5')).toBe(false);

    // The explicit override wins even for a stable build.
    expect(isDebugConsoleEnabled({ VITE_DEBUG_TERMINAL: '1' }, '0.5.5')).toBe(true);
    expect(isDebugConsoleEnabled({ VITE_DEBUG_TERMINAL: '0' }, '0.5.5-rc.1')).toBe(false);
    expect(isDebugConsoleEnabled({ VITE_DEBUG_TERMINAL: true }, '0.5.5')).toBe(true);
    expect(isDebugConsoleEnabled({ VITE_DEBUG_TERMINAL: false }, '0.5.5-rc.1')).toBe(false);
  });

  it('does not let a broken subscriber or console break logging', () => {
    const healthy = vi.fn();
    const broken = vi.fn(() => {
      throw new Error('subscriber failed');
    });
    subscribeDebug(broken);
    subscribeDebug(healthy);
    vi.mocked(console.debug).mockImplementationOnce(() => {
      throw new Error('console failed');
    });

    expect(() => debugLog('app', 'resilient')).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('copies the diagnostics report to the clipboard and returns it', async () => {
    debugLog('lookup', 'lookup.start', { key: 'a | b' });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const report = await copyDiagnosticsReport();

    expect(writeText).toHaveBeenCalledWith(report);
    expect(JSON.parse(report).counts.total).toBe(1);
  });

  it('still returns the report when the clipboard is blocked', async () => {
    debugLog('app', 'clipboard-blocked');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error('blocked');
        }),
      },
    });

    const report = await copyDiagnosticsReport();
    expect(JSON.parse(report).events[0].event).toBe('clipboard-blocked');
  });
});
