/**
 * Structured logging that feeds the in-app diagnostics console (spec 17).
 *
 * Kept as a thin wrapper so call sites that do not need a dedicated scope stay
 * unchanged. The console is only enabled for development and release-candidate
 * builds, so stable builds remain silent.
 */

import { debugLog } from './debugConsole';

export function devLog(event: string, fields: Record<string, unknown> = {}): void {
  debugLog('app', event, fields, 'debug');
}
