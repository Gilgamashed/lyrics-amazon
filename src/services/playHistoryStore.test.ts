import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOT_WINDOW_MS,
  MAX_STEP_MS,
  PLAY_THRESHOLD_MS,
  PlaySessionScorer,
  getHistoryStats,
  getRanking,
  recordPlay,
  resetHistory,
  songKey,
} from './playHistoryStore';
import { makeSong } from '../test/fixtures';

const KEY = 'lyrics-amazon:play-history:v1';

/** Records an Amazon-sourced play (the only source that counts). */
function playAmazon(song: ReturnType<typeof makeSong>, at?: number) {
  recordPlay(song, 'amazon', at);
}

describe('songKey', () => {
  it('normalises title and artist', () => {
    expect(songKey({ title: '  Espresso ', artist: 'Sabrina Carpenter' })).toBe(
      'espresso|sabrina carpenter'
    );
  });
});

describe('recordPlay / getRanking / stats', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records a play and exposes it in the ranking', () => {
    const now = Date.now();
    playAmazon(makeSong({ title: 'A', artist: 'B', album: 'Al', albumArt: 'art' }), now);

    const ranking = getRanking('lifetime', now);
    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toMatchObject({ title: 'A', artist: 'B', count: 1, lastPlayedAt: now });
    expect(getHistoryStats()).toEqual({ songs: 1, plays: 1 });
  });

  it('accumulates plays for the same song and updates metadata', () => {
    const now = Date.now();
    playAmazon(makeSong({ title: 'A', artist: 'B', album: 'old' }), now - 1000);
    playAmazon(makeSong({ title: 'A', artist: 'B', album: 'new' }), now);

    const ranking = getRanking('lifetime', now);
    expect(ranking).toHaveLength(1);
    expect(ranking[0].count).toBe(2);
    expect(ranking[0].album).toBe('new');
    expect(getHistoryStats()).toEqual({ songs: 1, plays: 2 });
  });

  it('sorts by count then recency', () => {
    const now = Date.now();
    playAmazon(makeSong({ title: 'One', artist: 'X' }), now - 5000);
    playAmazon(makeSong({ title: 'Two', artist: 'X' }), now - 4000);
    playAmazon(makeSong({ title: 'Two', artist: 'X' }), now - 100);
    playAmazon(makeSong({ title: 'Three', artist: 'X' }), now - 3000);

    const ranking = getRanking('lifetime', now);
    expect(ranking.map((r) => r.title)).toEqual(['Two', 'Three', 'One']);
  });

  it('filters the hot window', () => {
    const now = Date.now();
    playAmazon(makeSong({ title: 'Recent', artist: 'X' }), now - 1000);
    playAmazon(makeSong({ title: 'Old', artist: 'X' }), now - HOT_WINDOW_MS - 1000);

    const ranking = getRanking('hot', now);
    expect(ranking.map((r) => r.title)).toEqual(['Recent']);
  });

  it('filters the current month', () => {
    const now = new Date(2026, 4, 20, 12).getTime();
    const monthStart = new Date(2026, 4, 1).getTime();
    playAmazon(makeSong({ title: 'ThisMonth', artist: 'X' }), monthStart + 1000);
    playAmazon(makeSong({ title: 'LastMonth', artist: 'X' }), monthStart - 1000);

    const ranking = getRanking('month', now);
    expect(ranking.map((r) => r.title)).toEqual(['ThisMonth']);
  });

  it('returns an empty ranking for unknown periods of storage and resets', () => {
    expect(getRanking('hot')).toEqual([]);
    playAmazon(makeSong({ title: 'Temp', artist: 'X' }));
    expect(getRanking('lifetime')).toHaveLength(1);
    resetHistory();
    expect(getRanking('lifetime')).toEqual([]);
    expect(getHistoryStats()).toEqual({ songs: 0, plays: 0 });
  });

  it('ignores corrupt stored payloads', () => {
    localStorage.setItem(KEY, 'not-json');
    expect(getRanking('lifetime')).toEqual([]);

    localStorage.setItem(KEY, '42');
    expect(getRanking('lifetime')).toEqual([]);
  });

  it('fails silently when the storage write throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => playAmazon(makeSong({ title: 'Q', artist: 'X' }))).not.toThrow();
    spy.mockRestore();
  });

  it('counts only Amazon-sourced plays', () => {
    const now = Date.now();
    recordPlay(makeSong({ title: 'Amazon Song', artist: 'X' }), 'amazon', now);
    recordPlay(makeSong({ title: 'Spotify Song', artist: 'X' }), 'other', now);

    const ranking = getRanking('lifetime', now);
    expect(ranking.map((r) => r.title)).toEqual(['Amazon Song']);
    expect(getHistoryStats()).toEqual({ songs: 1, plays: 1 });
  });

  it('excludes legacy records written without a source', () => {
    const now = Date.now();
    // Simulate a pre-spec record persisted with no `source` field.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        'legacy|x': {
          key: 'legacy|x',
          title: 'Legacy',
          artist: 'X',
          album: '',
          albumArt: '',
          plays: [now],
          firstSeenAt: now,
          lastSeenAt: now,
        },
      })
    );

    expect(getRanking('lifetime', now)).toEqual([]);
    expect(getHistoryStats()).toEqual({ songs: 0, plays: 0 });
  });

  it('re-tagging a song as Amazon promotes its accumulated plays', () => {
    const now = Date.now();
    recordPlay(makeSong({ title: 'Switch', artist: 'X' }), 'other', now - 1000);
    expect(getRanking('lifetime', now)).toEqual([]);
    recordPlay(makeSong({ title: 'Switch', artist: 'X' }), 'amazon', now);
    expect(getRanking('lifetime', now)).toHaveLength(1);
  });
});

describe('storage availability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports nothing when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(playAmazon(makeSong())).toBeUndefined();
    expect(getRanking('lifetime')).toEqual([]);
    expect(getHistoryStats()).toEqual({ songs: 0, plays: 0 });
    expect(() => resetHistory()).not.toThrow();
  });

  it('treats a throwing localStorage access as unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(playAmazon(makeSong())).toBeUndefined();
      expect(getRanking('lifetime')).toEqual([]);
      expect(getHistoryStats()).toEqual({ songs: 0, plays: 0 });
      expect(() => resetHistory()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});

describe('PlaySessionScorer', () => {
  it('awards a single play only after the threshold of real playback', () => {
    const scorer = new PlaySessionScorer();
    // First sample establishes the baseline only.
    expect(scorer.addPosition(0)).toBe(false);

    let earned = false;
    for (let position = 1000; position <= PLAY_THRESHOLD_MS + 1000; position += 1000) {
      earned = scorer.addPosition(position) || earned;
    }
    expect(earned).toBe(true);
    expect(scorer.accumulatedMs).toBeGreaterThanOrEqual(PLAY_THRESHOLD_MS);
    // Once earned, it never fires again.
    expect(scorer.addPosition(PLAY_THRESHOLD_MS + 2000)).toBe(false);
  });

  it('ignores rewinds, pauses (zero delta) and forward seeks', () => {
    const scorer = new PlaySessionScorer();
    scorer.addPosition(1000);
    expect(scorer.addPosition(1000)).toBe(false);
    expect(scorer.addPosition(500)).toBe(false);
    expect(scorer.addPosition(1000 + MAX_STEP_MS + 1)).toBe(false);
    expect(scorer.accumulatedMs).toBe(0);
  });

  it('supports a custom threshold and reset', () => {
    const scorer = new PlaySessionScorer(500);
    scorer.addPosition(0);
    expect(scorer.addPosition(300)).toBe(false);
    expect(scorer.addPosition(700)).toBe(true);
    scorer.reset();
    expect(scorer.accumulatedMs).toBe(0);
    scorer.addPosition(50);
    expect(scorer.addPosition(60)).toBe(false);
  });
});
