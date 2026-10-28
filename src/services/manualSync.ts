/**
 * Manual Sync state machine (spec 19, W3).
 *
 * A pure reducer over the user's **saved** manual text: the session stamps the
 * current song time onto the current line while the user presses Enter, and
 * keeps a strict IDLE / SYNCING / PAUSED / ABORTED discipline so a stray
 * keypress, a pause or a song change can never corrupt the timestamps.
 *
 * The module is intentionally free of React and of the DOM so it can be unit
 * tested exhaustively.
 */

import { LyricLine } from '../types/lyrics';

export type ManualSyncState = 'idle' | 'syncing' | 'paused' | 'aborted';

/**
 * A position jump larger than this is treated as a seek (the app's playback
 * clock is bridge-authoritative, so a real seek shows up as a large delta).
 * Mirrors `playHistoryStore.MAX_STEP_MS`.
 */
export const MANUAL_SYNC_SEEK_THRESHOLD_MS = 2_500;

export interface ManualSyncLine {
  id: string;
  text: string;
  /** `null` until the line is stamped. */
  startTimeMs: number | null;
}

export interface ManualSyncSession {
  state: ManualSyncState;
  lines: ManualSyncLine[];
  /** Index of the line the next stamp lands on. */
  pointer: number;
  /** Raw identity of the song the session belongs to (abort key). */
  rawKey: string;
  /** Time of the most recent stamp. */
  lastStampMs: number | null;
  /** App-side clock re-arm target (the last break the user stepped back to). */
  rearmAtMs: number | null;
}

/** Splits the user's text into the session's working lines. */
export function manualSyncLines(text: string): ManualSyncLine[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => ({ id: `m-${index}`, text: line, startTimeMs: null }));
}

export function createManualSyncSession(text: string, rawKey: string): ManualSyncSession {
  return {
    state: 'idle',
    lines: manualSyncLines(text),
    pointer: 0,
    rawKey,
    lastStampMs: null,
    rearmAtMs: null,
  };
}

/** `IDLE`/`PAUSED` -> `SYNCING`. */
export function startManualSync(session: ManualSyncSession): ManualSyncSession {
  if (session.state === 'syncing') return session;
  return { ...session, state: 'syncing' };
}

/**
 * Stamps `atMs` onto the current line and advances the pointer.
 *
 * Only accepted while `SYNCING`; the last write for a line wins.
 */
export function stampManualSync(
  session: ManualSyncSession,
  atMs: number
): ManualSyncSession {
  if (session.state !== 'syncing') return session;
  if (session.lines.length === 0) return session;
  const index = Math.min(session.pointer, session.lines.length - 1);
  const lines = session.lines.map((line, lineIndex) =>
    lineIndex === index ? { ...line, startTimeMs: Math.max(0, Math.round(atMs)) } : line
  );
  const pointer = Math.min(index + 1, lines.length - 1);
  return { ...session, lines, pointer, lastStampMs: atMs, rearmAtMs: null };
}

/**
 * Moves the pointer back to the last stamped break and re-arms the app clock
 * there (the "safety net").
 */
export function stepBackManualSync(session: ManualSyncSession): ManualSyncSession {
  let target = -1;
  for (let index = 0; index < session.lines.length; index += 1) {
    if (session.lines[index].startTimeMs !== null) target = index;
  }
  if (target === -1) return session;
  const stamp = session.lines[target].startTimeMs ?? null;
  return {
    ...session,
    pointer: target,
    lastStampMs: stamp,
    rearmAtMs: stamp,
  };
}

/** Playback/session interruption: no timestamps are accepted while paused. */
export function pauseManualSync(session: ManualSyncSession): ManualSyncSession {
  if (session.state === 'aborted') return session;
  return { ...session, state: 'paused' };
}

/** Playback resumed: stamping is accepted again from the current song time. */
export function resumeManualSync(session: ManualSyncSession): ManualSyncSession {
  if (session.state !== 'paused') return session;
  return { ...session, state: 'syncing', rearmAtMs: null };
}

/**
 * Song changed or the user cancelled: the temporary timestamps are wiped and
 * the pointer resets, so the new song starts from a clean state.
 */
export function abortManualSync(session: ManualSyncSession): ManualSyncSession {
  return {
    ...session,
    state: 'aborted',
    lines: session.lines.map((line) => ({ ...line, startTimeMs: null })),
    pointer: 0,
    lastStampMs: null,
    rearmAtMs: null,
  };
}

/**
 * Re-arms the pointer for a new song position (after a seek or a resume).
 * The pointer lands on the last line that already starts at or before `atMs`.
 */
export function rearmManualSync(
  session: ManualSyncSession,
  atMs: number
): ManualSyncSession {
  let pointer = 0;
  for (let index = 0; index < session.lines.length; index += 1) {
    const start = session.lines[index].startTimeMs;
    if (start !== null && start <= atMs) pointer = index + 1;
  }
  return {
    ...session,
    pointer: Math.min(pointer, Math.max(0, session.lines.length - 1)),
    rearmAtMs: null,
  };
}

/** The stamped lines as `LyricLine`s (unstamped lines are not part of a timeline). */
export function manualSyncToLyricLines(session: ManualSyncSession): LyricLine[] {
  return session.lines
    .filter((line) => line.startTimeMs !== null)
    .map((line) => ({
      id: line.id,
      text: line.text,
      startTimeMs: line.startTimeMs ?? 0,
    }));
}

/** Human-readable status for the diagnostics terminal and the sync strip. */
export function describeManualSync(session: ManualSyncSession): string {
  const stamped = session.lines.filter((line) => line.startTimeMs !== null).length;
  const lines = session.lines.length;
  if (session.state === 'idle') return `Ready (${lines} lines)`;
  if (session.state === 'syncing') {
    return `Syncing - line ${Math.min(session.pointer + 1, lines)}/${lines} (${stamped} stamped)`;
  }
  if (session.state === 'paused') return `Paused - ${stamped} stamped`;
  return 'Aborted - timestamps discarded';
}
