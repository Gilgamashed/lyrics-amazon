import { describe, expect, it } from 'vitest';
import {
  MANUAL_SYNC_SEEK_THRESHOLD_MS,
  ManualSyncSession,
  abortManualSync,
  createManualSyncSession,
  describeManualSync,
  manualSyncLines,
  manualSyncToLyricLines,
  pauseManualSync,
  rearmManualSync,
  resumeManualSync,
  stampManualSync,
  startManualSync,
  stepBackManualSync,
} from './manualSync';

const TEXT = 'First line\nSecond line\nThird line';

function session(state: ManualSyncSession['state'] = 'idle'): ManualSyncSession {
  const created = createManualSyncSession(TEXT, 'raw-key');
  return state === 'idle' ? created : { ...created, state };
}

describe('manualSync', () => {
  it('splits the saved text into working lines', () => {
    expect(manualSyncLines('  one \n\n two ')).toEqual([
      { id: 'm-0', text: 'one', startTimeMs: null },
      { id: 'm-1', text: 'two', startTimeMs: null },
    ]);
  });

  it('starts idle with no timestamps', () => {
    const created = createManualSyncSession(TEXT, 'raw-key');
    expect(created.state).toBe('idle');
    expect(created.pointer).toBe(0);
    expect(created.lastStampMs).toBeNull();
    expect(created.rearmAtMs).toBeNull();
    expect(created.rawKey).toBe('raw-key');
    expect(created.lines.every((line) => line.startTimeMs === null)).toBe(true);
  });

  it('stamps the current line and advances the pointer', () => {
    const syncing = startManualSync(session());
    const stamped = stampManualSync(syncing, 1500);

    expect(stamped.lines[0].startTimeMs).toBe(1500);
    expect(stamped.pointer).toBe(1);
    expect(stamped.lastStampMs).toBe(1500);
  });

  it('ignores stamps while the session is not syncing', () => {
    expect(stampManualSync(session('idle'), 1000).lines[0].startTimeMs).toBeNull();
    expect(stampManualSync(session('paused'), 1000).lines[0].startTimeMs).toBeNull();
    expect(stampManualSync(session('aborted'), 1000).lines[0].startTimeMs).toBeNull();
  });

  it('ignores a stamp when there is no text', () => {
    const empty = createManualSyncSession('', 'raw-key');
    expect(stampManualSync(startManualSync(empty), 1000).lines).toEqual([]);
  });

  it('keeps the last write for a line', () => {
    let current = startManualSync(session());
    current = stampManualSync(current, 1000);
    // Step back onto the same line and stamp it again.
    current = stepBackManualSync(current);
    expect(current.pointer).toBe(0);
    current = stampManualSync(current, 3000);

    expect(current.lines[0].startTimeMs).toBe(3000);
  });

  it('clamps the pointer at the last line', () => {
    let current = startManualSync(session());
    for (let index = 0; index < 10; index += 1) {
      current = stampManualSync(current, 1000 * (index + 1));
    }
    expect(current.pointer).toBe(2);
    expect(current.lines).toHaveLength(3);
  });

  it('steps back to the last stamped break and re-arms the clock', () => {
    let current = startManualSync(session());
    current = stampManualSync(current, 1000);
    current = stampManualSync(current, 2000);

    const stepped = stepBackManualSync(current);
    expect(stepped.pointer).toBe(1);
    expect(stepped.rearmAtMs).toBe(2000);
    expect(stepped.lastStampMs).toBe(2000);
  });

  it('does nothing when no line has been stamped yet', () => {
    const stepped = stepBackManualSync(startManualSync(session()));
    expect(stepped.pointer).toBe(0);
    expect(stepped.rearmAtMs).toBeNull();
  });

  it('pauses and resumes, accepting stamps again', () => {
    const paused = pauseManualSync(startManualSync(session()));
    expect(paused.state).toBe('paused');
    expect(stampManualSync(paused, 1000).lines[0].startTimeMs).toBeNull();

    const resumed = resumeManualSync(paused);
    expect(resumed.state).toBe('syncing');
    expect(stampManualSync(resumed, 1000).lines[0].startTimeMs).toBe(1000);
  });

  it('does not resume a session that is not paused', () => {
    expect(resumeManualSync(session('idle')).state).toBe('idle');
    expect(resumeManualSync(session('aborted')).state).toBe('aborted');
  });

  it('does not pause an aborted session', () => {
    expect(pauseManualSync(session('aborted')).state).toBe('aborted');
  });

  it('aborts by wiping the timestamps and resetting the pointer', () => {
    let current = startManualSync(session());
    current = stampManualSync(current, 1000);

    const aborted = abortManualSync(current);
    expect(aborted.state).toBe('aborted');
    expect(aborted.pointer).toBe(0);
    expect(aborted.lastStampMs).toBeNull();
    expect(aborted.rearmAtMs).toBeNull();
    expect(aborted.lines.every((line) => line.startTimeMs === null)).toBe(true);
  });

  it('re-arms the pointer for a new position', () => {
    let current = startManualSync(session());
    current = stampManualSync(current, 1000);
    current = stampManualSync(current, 5000);

    const rearmed = rearmManualSync(current, 3000);
    expect(rearmed.pointer).toBe(1);
    expect(rearmed.rearmAtMs).toBeNull();
  });

  it('exposes only the stamped lines as LyricLines', () => {
    let current = startManualSync(session());
    current = stampManualSync(current, 1000);

    const lines = manualSyncToLyricLines(current);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ text: 'First line', startTimeMs: 1000 });
  });

  it('describes its state', () => {
    expect(describeManualSync(session('idle'))).toContain('Ready');
    expect(describeManualSync(startManualSync(session()))).toContain('Syncing');
    expect(describeManualSync(session('paused'))).toContain('Paused');
    expect(describeManualSync(session('aborted'))).toContain('Aborted');
  });

  it('exposes the seek threshold used by the app', () => {
    expect(MANUAL_SYNC_SEEK_THRESHOLD_MS).toBe(2500);
  });
});
