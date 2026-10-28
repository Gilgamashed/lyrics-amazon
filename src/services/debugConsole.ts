/**
 * In-app diagnostics console (spec 17, W1).
 *
 * Every stage that can make a lyric lookup fail — the native bridge reading,
 * metadata sanitization, the provider chain, the identity gate, the caches and
 * the UI actions — funnels its decision through `debugLog`. The events land in
 * a bounded in-memory ring buffer that the Debug Terminal overlay renders and
 * that the "copy diagnostics report" action exports as JSON for bug reports.
 *
 * The console is only enabled for builds that need it: local development and
 * the release-candidate (test channel) builds. Stable builds stay silent so
 * shipped users never carry the overhead.
 */

import { APP_VERSION } from '../appVersion';

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

/** Coarse grouping used by the terminal's scope filter. */
export type DebugScope =
  | 'app'
  | 'bridge'
  | 'metadata'
  | 'detection'
  | 'lookup'
  | 'provider'
  | 'gate'
  | 'cache'
  | 'override'
  | 'manual'
  | 'uia'
  | 'ui';

export const DEBUG_SCOPES: DebugScope[] = [
  'app',
  'bridge',
  'metadata',
  'detection',
  'lookup',
  'provider',
  'gate',
  'cache',
  'override',
  'manual',
  'uia',
  'ui',
];

export const DEBUG_LEVELS: DebugLevel[] = ['debug', 'info', 'warn', 'error'];

export interface DebugEvent {
  id: number;
  at: number;
  level: DebugLevel;
  scope: DebugScope;
  event: string;
  data?: Record<string, unknown>;
}

/** Maximum number of retained events; the oldest are dropped first. */
export const DEBUG_MAX_EVENTS = 2000;

/** Prerelease versions (rc/beta/alpha) are the test channel and keep the console on. */
const PRERELEASE_VERSION = /-(rc|beta|alpha)(\.\d+)?$/i;

type DebugEnv = Record<string, unknown> | undefined;

let events: DebugEvent[] = [];
let snapshot: DebugEvent[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function readEnvFlag(env: DebugEnv, name: 'DEV' | 'VITE_DEBUG_TERMINAL'): string | undefined {
  const value = env?.[name];
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return undefined;
}

/** True for the prerelease versions that carry the diagnostics surface. */
export function isPrereleaseVersion(version: string): boolean {
  return PRERELEASE_VERSION.test(version);
}

/**
 * True when this build may expose the debug terminal.
 *
 * - `VITE_DEBUG_TERMINAL=1` / `=0` forces the decision (used by CI and by
 *   anyone running a production web build locally).
 * - Development builds are always enabled.
 * - Release-candidate builds (the `test-latest` channel) are enabled; stable
 *   builds are not.
 *
 * The environment and version are injectable so the stable/rc gate can be
 * tested without rebuilding the app.
 */
export function isDebugConsoleEnabled(
  env: DebugEnv = import.meta.env as unknown as DebugEnv,
  version: string = APP_VERSION
): boolean {
  const forced = readEnvFlag(env, 'VITE_DEBUG_TERMINAL');
  if (forced === '1' || forced === 'true') return true;
  if (forced === '0' || forced === 'false') return false;
  if (readEnvFlag(env, 'DEV') === 'true') return true;
  return isPrereleaseVersion(version);
}

function mirrorToConsole(entry: DebugEvent): void {
  try {
    const payload = entry.data ?? {};
    const prefix = `[lyrics-amazon] ${entry.scope}:${entry.event}`;
    if (entry.level === 'error') console.error(prefix, payload);
    else if (entry.level === 'warn') console.warn(prefix, payload);
    else if (entry.level === 'info') console.info(prefix, payload);
    else console.debug(prefix, payload);
  } catch {
    // console unavailable - diagnostics must never break the app
  }
}

function notify(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // a broken subscriber must not break logging
    }
  }
}

/**
 * Records one diagnostic event.
 *
 * No-op when the console is disabled for this build, so call sites can stay
 * unconditional.
 */
export function debugLog(
  scope: DebugScope,
  event: string,
  data?: Record<string, unknown>,
  level: DebugLevel = 'info'
): void {
  if (!isDebugConsoleEnabled()) return;

  const entry: DebugEvent = { id: nextId++, at: Date.now(), level, scope, event };
  if (data && Object.keys(data).length > 0) entry.data = data;

  events.push(entry);
  if (events.length > DEBUG_MAX_EVENTS) {
    events.splice(0, events.length - DEBUG_MAX_EVENTS);
  }
  snapshot = events.slice();

  mirrorToConsole(entry);
  notify();
}

/** Subscribe to buffer changes; used by the terminal through `useSyncExternalStore`. */
export function subscribeDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current events. The reference is stable between changes so React can diff it. */
export function getDebugEvents(): DebugEvent[] {
  return snapshot;
}

/** Drops every retained event. */
export function clearDebugEvents(): void {
  events = [];
  snapshot = [];
  notify();
}

function platformInfo(): Record<string, unknown> {
  if (typeof navigator === 'undefined') return {};
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    online: typeof navigator.onLine === 'boolean' ? navigator.onLine : undefined,
  };
}

/**
 * Builds the JSON payload behind "copy diagnostics report": version, platform
 * and every retained event, so a user can paste it into a bug report.
 */
export function buildDiagnosticsReport(): string {
  const byLevel: Record<string, number> = {};
  const byScope: Record<string, number> = {};
  for (const entry of snapshot) {
    byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
    byScope[entry.scope] = (byScope[entry.scope] ?? 0) + 1;
  }

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      platform: platformInfo(),
      counts: { total: snapshot.length, byLevel, byScope },
      events: snapshot,
    },
    null,
    2
  );
}

/** Copies the diagnostics report to the clipboard; returns the copied text. */
export async function copyDiagnosticsReport(): Promise<string> {
  const report = buildDiagnosticsReport();
  try {
    await navigator.clipboard.writeText(report);
  } catch {
    // clipboard blocked - the caller still gets the report text
  }
  return report;
}
