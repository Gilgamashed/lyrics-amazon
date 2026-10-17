import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { APP_VERSION } from './appVersion';
import { fetchLyrics } from './services/lyricsService';
import { recordPlay } from './services/playHistoryStore';
import { trackKey } from './services/metaOverrideStore';
import { capturePlayback } from './services/captureService';
import { alignPlainLyrics } from './services/karaokeAlignService';
import { saveKaraokeAIConfig } from './services/karaokeAIConfigStore';
import { LyricsData, NowPlaying, Song } from './types/lyrics';

vi.mock('./services/captureService', () => ({
  capturePlayback: vi.fn(async () => new Blob(['audio'], { type: 'audio/wav' })),
  DEFAULT_CAPTURE_MS: 15000,
}));

vi.mock('./services/karaokeAlignService', async (importOriginal) => {
  const original = await importOriginal<typeof import('./services/karaokeAlignService')>();
  return {
    ...original,
    alignPlainLyrics: vi.fn(async () => [
      { id: 'ai-sync-0', startTimeMs: 0, endTimeMs: 1000, text: 'City Lights opening' },
      { id: 'ai-sync-1', startTimeMs: 1000, endTimeMs: 2000, text: 'City Lights middle' },
    ]),
  };
});

vi.mock('./services/playHistoryStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/playHistoryStore')>();
  return { ...actual, recordPlay: vi.fn(actual.recordPlay) };
});

let rafCallback: ((time: number) => void) | null = null;
function runFrame() {
  act(() => {
    rafCallback?.(0);
  });
}

function nowPlaying(overrides: Partial<NowPlaying> = {}): NowPlaying {
  return {
    source: 'Amazon Music',
    title: 'Track',
    artist: 'Artist',
    album: null,
    durationMs: 180_000,
    positionMs: 0,
    isPlaying: true,
    appId: 'AmazonMusic.exe',
    isAmazon: true,
    albumArt: null,
    ...overrides,
  };
}

const OVERRIDES_KEY = 'lyrics-amazon:meta-overrides:v1';

const bridgeBridge = vi.hoisted(() => ({
  client: { start: vi.fn(), stop: vi.fn() },
  onConnectionChange: (_state: string) => {},
  onNowPlaying: (_state: unknown) => {},
}));

vi.mock('./services/bridgeService', () => ({
  createBridgeClient: (options: {
    onConnectionChange: (state: string) => void;
    onNowPlaying: (state: unknown) => void;
  }) => {
    bridgeBridge.onConnectionChange = options.onConnectionChange;
    bridgeBridge.onNowPlaying = options.onNowPlaying;
    return bridgeBridge.client;
  },
  fetchNowPlaying: vi.fn(async () => null),
}));

vi.mock('./services/lyricsService', async (importOriginal) => {
  const original = await importOriginal<typeof import('./services/lyricsService')>();
  return {
    ...original,
    fetchLyrics: vi.fn(async (song: Song): Promise<LyricsData> => ({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumArt: song.albumArt,
      provider: 'Genius',
      syncedLyrics: [
        { id: 'a', startTimeMs: 0, text: `${song.title} opening` },
        { id: 'b', startTimeMs: 2000, text: `${song.title} middle` },
      ],
      plainLyrics: `${song.title} opening\n${song.title} middle`,
      annotations: [],
      trivia: [],
    })),
  };
});

vi.mock('./services/aiService', async (importOriginal) => {
  const original = await importOriginal<typeof import('./services/aiService')>();
  return {
    ...original,
    resolveAIConfig: vi.fn(() => ({ providerUrl: '', model: '', apiKey: '', enabled: false })),
  };
});

const mediaSessionActions: Record<string, (details: { seekTime?: number }) => void> = {};

function stubMediaSession() {
  mediaSessionActions.play = vi.fn();
  mediaSessionActions.pause = vi.fn();
  mediaSessionActions.seekto = vi.fn((_d) => {});

  Object.defineProperty(navigator, 'mediaSession', {
    value: {
      metadata: null,
      setActionHandler: (action: string, handler: (details: { seekTime?: number }) => void) => {
        mediaSessionActions[action] = handler;
      },
    },
    configurable: true,
  });

  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(public init: Record<string, unknown>) {}
    }
  );
}

describe('App', () => {
  beforeEach(() => {
    bridgeBridge.onConnectionChange = () => {};
    bridgeBridge.onNowPlaying = () => {};
    vi.mocked(fetchLyrics).mockClear();
    vi.mocked(recordPlay).mockClear();
    vi.mocked(capturePlayback).mockClear();
    vi.mocked(alignPlainLyrics).mockClear();
    localStorage.clear();
    stubMediaSession();
    rafCallback = null;
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (navigator as { mediaSession?: unknown }).mediaSession;
  });

  it('boots into an idle state with the docked surface and version tag', () => {
    render(<App />);
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Nothing Playing')).toBeInTheDocument();
    expect(within(banner).getByText('Browser (Media Session)')).toBeInTheDocument();
    expect(screen.getByText('Provider: None')).toBeInTheDocument();
    expect(bridgeBridge.client.start).toHaveBeenCalled();
  });

  it('renders the translucent app-version annotation', () => {
    render(<App />);
    expect(screen.getByTestId('app-version')).toHaveTextContent(`v${APP_VERSION}`);
  });

  it('registers Browser detection until the bridge reports connected', async () => {
    render(<App />);
    expect(screen.getByText('Browser (Media Session)')).toBeInTheDocument();

    await act(async () => {
      bridgeBridge.onConnectionChange('connected');
    });
    expect(screen.getByText('Desktop (native)')).toBeInTheDocument();
  });

  it('detects a desktop track, loads lyrics and renders the header', async () => {
    render(<App />);

    await act(async () => {
      bridgeBridge.onConnectionChange('connected');
    });
    await act(async () => {
      bridgeBridge.onNowPlaying({
        source: 'Amazon Music',
        title: 'City Lights',
        artist: 'Unknown',
        album: 'Singles',
        durationMs: 180_000,
        positionMs: 5_000,
        isPlaying: true,
        appId: 'AmazonMusic.exe',
        isAmazon: true,
        albumArt: null,
      });
    });

    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('City Lights')).toBeInTheDocument();
    expect(vi.mocked(fetchLyrics)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'desktop-city-lights-unknown-artist' }),
      expect.objectContaining({ useCache: true })
    );
    expect(await screen.findByText('City Lights opening')).toBeInTheDocument();

    // Same track replayed: no new lyrics fetch.
    vi.mocked(fetchLyrics).mockClear();
    await act(async () => {
      bridgeBridge.onNowPlaying({
        source: 'Amazon Music',
        title: 'City Lights',
        artist: 'Unknown',
        durationMs: 180_000,
        positionMs: 10_000,
        isPlaying: true,
        appId: 'AmazonMusic.exe',
        isAmazon: true,
        albumArt: null,
      });
    });
    expect(vi.mocked(fetchLyrics)).not.toHaveBeenCalled();
  });

  it('switches between Karaoke and Full Sheet views', async () => {
    render(<App />);
    await act(async () => {
      bridgeBridge.onConnectionChange('connected');
    });
    await act(async () => {
      bridgeBridge.onNowPlaying({
        source: 'Amazon Music',
        title: 'City Lights',
        artist: 'Unknown',
        durationMs: 180_000,
        positionMs: 5_000,
        isPlaying: true,
        appId: 'AmazonMusic.exe',
        isAmazon: true,
        albumArt: null,
      });
    });
    await screen.findByText('City Lights opening');

    fireEvent.click(screen.getByText('Full Sheet'));
    expect(screen.getByPlaceholderText('Search within lyrics...')).toBeInTheDocument();
  });

  it('opens the Info drawer', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Artist, album and lyrics info'));
    expect(screen.getByText('Song & Album')).toBeInTheDocument();
  });

  it('shows the Most Listened rankings and plays a selected song', async () => {
    recordPlay(
      { id: 'x', title: 'Ranked Song', artist: 'Ranked Artist', album: '', albumArt: '', durationMs: 0 },
      'amazon',
      Date.now()
    );
    render(<App />);

    fireEvent.click(screen.getByTitle('Most Listened'));
    expect(screen.getByText('Ranked Song')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hot' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ranked Song'));
    expect(await screen.findByText('Ranked Song opening')).toBeInTheDocument();
    // Selecting a song returns to the lyrics surface.
    expect(screen.queryByRole('button', { name: 'Lifetime' })).not.toBeInTheDocument();
  });

  it('publishes media session metadata and honors play/pause/seek actions', async () => {
    render(<App />);
    const metadata = (
      navigator.mediaSession.metadata as unknown as { init: Record<string, unknown> }
    ).init;
    expect(metadata).toEqual(expect.objectContaining({ title: 'Nothing Playing' }));

    await act(async () => {
      mediaSessionActions.pause({});
      mediaSessionActions.play({});
      mediaSessionActions.seekto({ seekTime: 5 });
    });
    expect(screen.getByTestId('app-version')).toBeInTheDocument();
  });

  it('awards an Amazon-sourced play after 30s of real desktop playback', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    try {
      render(<App />);
      await act(async () => {
        bridgeBridge.onConnectionChange('connected');
      });
      await act(async () => {
        bridgeBridge.onNowPlaying(nowPlaying({ title: 'Espresso', artist: 'Sabrina Carpenter' }));
      });

      for (let i = 1; i <= 31; i += 1) {
        vi.setSystemTime(i * 1000);
        runFrame();
      }

      expect(vi.mocked(recordPlay)).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Espresso', artist: 'Sabrina Carpenter' }),
        'amazon',
        expect.any(Number)
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not count a non-Amazon desktop session, even after 30s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    try {
      render(<App />);
      await act(async () => {
        bridgeBridge.onConnectionChange('connected');
      });
      await act(async () => {
        bridgeBridge.onNowPlaying(
          nowPlaying({ title: 'Espresso', artist: 'Sabrina Carpenter', appId: 'Spotify.exe', isAmazon: false })
        );
      });

      for (let i = 1; i <= 31; i += 1) {
        vi.setSystemTime(i * 1000);
        runFrame();
      }

      expect(vi.mocked(recordPlay)).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never lets a slow stale response overwrite the current track', async () => {
    let resolveA: (value: LyricsData) => void = () => {};
    vi.mocked(fetchLyrics).mockImplementationOnce(
      () =>
        new Promise<LyricsData>((resolve) => {
          resolveA = resolve;
        })
    );

    render(<App />);
    await act(async () => {
      bridgeBridge.onConnectionChange('connected');
    });
    await act(async () => {
      bridgeBridge.onNowPlaying(nowPlaying({ title: 'Race A', artist: 'Artist A' }));
    });
    await act(async () => {
      bridgeBridge.onNowPlaying(nowPlaying({ title: 'Race B', artist: 'Artist B' }));
    });
    expect(await screen.findByText('Race B opening')).toBeInTheDocument();

    await act(async () => {
      resolveA({
        songId: 'a',
        title: 'Race A',
        artist: 'Artist A',
        album: '',
        albumArt: '',
        provider: 'Genius',
        syncedLyrics: [{ id: 'x', startTimeMs: 0, text: 'Race A opening' }],
        plainLyrics: 'Race A opening',
        annotations: [],
        trivia: [],
      });
    });

    expect(screen.getByText('Race B opening')).toBeInTheDocument();
    expect(screen.queryByText('Race A opening')).not.toBeInTheDocument();
  });

  it('rejects a placeholder title and keeps the last good track', async () => {
    render(<App />);
    await act(async () => {
      bridgeBridge.onConnectionChange('connected');
    });
    await act(async () => {
      bridgeBridge.onNowPlaying(nowPlaying({ title: 'Rasa', artist: 'oktobernatt' }));
    });
    await screen.findByText('Rasa opening');

    vi.mocked(fetchLyrics).mockClear();
    await act(async () => {
      bridgeBridge.onNowPlaying(
        nowPlaying({ title: 'Artist name', artist: 'oktobernatt', positionMs: 1000 })
      );
    });

    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Rasa')).toBeInTheDocument();
    expect(screen.queryByText('Artist name')).not.toBeInTheDocument();
    expect(vi.mocked(fetchLyrics)).not.toHaveBeenCalled();
  });

  it('applies a manual correction, re-searches without cache, persists and reverts', async () => {
    render(<App />);
    await act(async () => {
      bridgeBridge.onConnectionChange('connected');
    });
    await act(async () => {
      bridgeBridge.onNowPlaying(nowPlaying({ title: 'Wrong Title', artist: 'Real Artist' }));
    });
    await screen.findByText('Wrong Title opening');
    vi.mocked(fetchLyrics).mockClear();

    fireEvent.click(screen.getByLabelText('Fix song or artist name'));
    fireEvent.change(screen.getByLabelText('Song name'), { target: { value: 'Correct Title' } });
    fireEvent.click(screen.getByText('Search again'));

    expect(within(screen.getByRole('banner')).getByText('Correct Title')).toBeInTheDocument();
    expect(vi.mocked(fetchLyrics)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Correct Title', artist: 'Real Artist' }),
      expect.objectContaining({ useCache: false })
    );
    expect(localStorage.getItem(OVERRIDES_KEY)).toContain('Correct Title');
    expect(localStorage.getItem(OVERRIDES_KEY)).toContain(trackKey('Wrong Title', 'Real Artist'));

    // The same detected track re-report resolves through the override, no refetch.
    vi.mocked(fetchLyrics).mockClear();
    await act(async () => {
      bridgeBridge.onNowPlaying(
        nowPlaying({ title: 'Wrong Title', artist: 'Real Artist', positionMs: 2000 })
      );
    });
    expect(within(screen.getByRole('banner')).getByText('Correct Title')).toBeInTheDocument();
    expect(vi.mocked(fetchLyrics)).not.toHaveBeenCalled();

    // Revert restores the detected metadata and re-searches without cache.
    fireEvent.click(screen.getByLabelText('Fix song or artist name'));
    fireEvent.click(screen.getByText('Revert'));
    expect(within(screen.getByRole('banner')).getByText('Wrong Title')).toBeInTheDocument();
    expect(vi.mocked(fetchLyrics)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Wrong Title' }),
      expect.objectContaining({ useCache: false })
    );
    expect(localStorage.getItem(OVERRIDES_KEY)).not.toContain('Correct Title');
  });

  it('generates AI karaoke for a plain-only track and persists it', async () => {
    vi.mocked(fetchLyrics).mockResolvedValueOnce({
      songId: 'desktop-city-lights-unknown-artist',
      title: 'City Lights',
      artist: 'Unknown',
      album: 'Singles',
      albumArt: '',
      provider: 'Genius',
      syncedLyrics: [],
      plainLyrics: 'City Lights opening\nCity Lights middle',
      annotations: [],
      trivia: [],
    });
    saveKaraokeAIConfig({
      endpointUrl: 'https://api.example.com/v1',
      model: 'whisper-1',
      apiKey: 'sk-test',
    });

    render(<App />);
    await act(async () => {
      bridgeBridge.onConnectionChange('connected');
    });
    await act(async () => {
      bridgeBridge.onNowPlaying(nowPlaying({ title: 'City Lights', artist: 'Unknown' }));
    });

    const button = await screen.findByTestId('generate-karaoke');
    expect(button).toBeEnabled();

    await act(async () => {
      fireEvent.click(button);
    });

    // The plain-only result is replaced by the synced karaoke lines.
    expect(await screen.findByText('City Lights opening')).toBeInTheDocument();
    expect(vi.mocked(capturePlayback)).toHaveBeenCalledOnce();
    expect(vi.mocked(alignPlainLyrics)).toHaveBeenCalledOnce();
    // Persisted permanently as AI Sync so it wins future lookups.
    expect(localStorage.getItem('lyrics-amazon:ai-lyrics:v1')).toContain('AI Sync');
    // The plain-only banner is gone once timed lyrics exist.
    expect(screen.queryByTestId('karaoke-ai-banner')).not.toBeInTheDocument();
  });
});
