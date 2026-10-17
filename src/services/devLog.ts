/**
 * Dev-only structured logging for diagnostics. Silent in production builds so
 * provider attempts and detection details never reach a shipped console.
 */

function isDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

export function devLog(event: string, fields: Record<string, unknown> = {}): void {
  if (!isDev()) return;
  try {
    console.debug(`[lyrics-amazon] ${event}`, fields);
  } catch {
    // console unavailable - never let diagnostics break the app
  }
}
