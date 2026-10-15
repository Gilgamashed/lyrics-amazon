import {
  AIConfig,
  LyricsData,
  NowPlaying,
  Song,
  WindowState,
} from '../types/lyrics';

export const SONG: Song = {
  id: 's-1',
  title: 'Espresso',
  artist: 'Sabrina Carpenter',
  album: 'Short n\' Sweet',
  albumArt: '',
  durationMs: 180_000,
  year: '2024',
};

export function makeSong(overrides: Partial<Song> = {}): Song {
  return { ...SONG, ...overrides };
}

export const NOW_PLAYING: NowPlaying = {
  source: 'Amazon Music',
  title: 'Espresso',
  artist: 'Sabrina Carpenter',
  album: 'Short n\' Sweet',
  durationMs: 180_000,
  positionMs: 0,
  isPlaying: true,
};

export function makeNowPlaying(overrides: Partial<NowPlaying> = {}): NowPlaying {
  return { ...NOW_PLAYING, ...overrides };
}

export function makeLyrics(overrides: Partial<LyricsData> = {}): LyricsData {
  return {
    songId: SONG.id,
    title: SONG.title,
    artist: SONG.artist,
    album: SONG.album,
    albumArt: '',
    provider: 'Genius',
    syncedLyrics: [
      { id: 'l0', startTimeMs: 1000, text: 'First lyric line', section: 'intro' },
      { id: 'l1', startTimeMs: 3000, text: 'Second lyric line', section: 'chorus' },
      { id: 'l2', startTimeMs: 5000, text: 'Third lyric line', annotationId: 'ann-2' },
    ],
    plainLyrics: 'First lyric line\nSecond lyric line\nThird lyric line',
    annotations: [
      {
        id: 'ann-1',
        lineRef: 'Second lyric line',
        header: 'Wordplay & Hidden Meaning',
        content: 'A pivotal metaphor.',
        verifiedBy: 'Genius Editorial Team',
        votes: 3410,
      },
      {
        id: 'ann-2',
        lineRef: 'Third lyric line',
        header: 'Lyrical Theme & Concept',
        content: 'Establishes the central conflict.',
        verifiedBy: 'Sabrina Carpenter (Verified Artist)',
        votes: 1950,
      },
    ],
    trivia: ['Trivia fact one', 'Trivia fact two'],
    trackInfo: {
      writers: ['Sabrina Carpenter'],
      producers: ['Producer X'],
      releaseDate: '2024',
    },
    ...overrides,
  };
}

export const AI_CONFIG_OFF: AIConfig = {
  providerUrl: '',
  model: '',
  apiKey: '',
  enabled: false,
};

export const AI_CONFIG_ON: AIConfig = {
  providerUrl: 'https://llm.example.com/v1',
  model: 'gpt-test',
  apiKey: 'sk-test',
  enabled: true,
};

export function makeWindowState(overrides: Partial<WindowState> = {}): WindowState {
  return {
    opacity: 0.9,
    blur: 16,
    viewMode: 'karaoke',
    theme: 'acrylic',
    fontSize: 'medium',
    autoScroll: true,
    ...overrides,
  };
}