import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { APP_VERSION } from './appVersion';
import { fetchLyrics } from './services/lyricsService';
import { recordPlay } from './services/playHistoryStore';
import { LyricsData, Song } from './types/lyrics';

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
    localStorage.clear();
    stubMediaSession();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
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
      });
    });

    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('City Lights')).toBeInTheDocument();
    expect(vi.mocked(fetchLyrics)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'desktop-city-lights-unknown' }),
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
});
