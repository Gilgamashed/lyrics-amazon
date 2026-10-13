import { render, screen, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { fetchLyrics } from './services/lyricsService';
import { resolveAIConfig } from './services/aiService';
import { NowPlaying, LyricsData, Song } from './types/lyrics';
import { makeNowPlaying } from './test/fixtures';

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
  mediaSessionActions.seekto = vi.fn((d) => {});

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

  it('boots into the first curated track with karaoke lyrics', async () => {
    render(<App />);
    const banner = screen.getByRole('banner');
    expect(
      within(banner).getByText((_, el) =>
        el?.tagName === 'P' && (el.textContent ?? '').includes('Espresso') ? true : false
      )
    ).toBeInTheDocument();
    expect(screen.getByText('♪ (Upbeat nu-disco groove plays) ♪')).toBeInTheDocument();
    expect(screen.getByText(/lines parsed/)).toBeInTheDocument();
    expect(screen.getByText('Browser (Media Session)')).toBeInTheDocument();
    expect(vi.mocked(fetchLyrics)).not.toHaveBeenCalled();
    expect(bridgeBridge.client.start).toHaveBeenCalled();
  });

  it('registers Browser detection until the bridge reports connected', async () => {
    render(<App />);
    expect(screen.getByText('Browser (Media Session)')).toBeInTheDocument();

    await act(async () => {
      bridgeBridge.onConnectionChange('connected');
    });
    expect(screen.getByText('Desktop (native)')).toBeInTheDocument();
  });

  it('pauses and resumes playback from the play button', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Pause playback'));
    expect(screen.getByTitle('Play & sync lyrics')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Play & sync lyrics'));
    expect(screen.getByTitle('Pause playback')).toBeInTheDocument();
  });

  it('seeks to a lyric line from the scrubber', () => {
    render(<App />);
    const slider = screen.getAllByRole('slider').find((el) =>
      el.className.includes('accent-cyan-400')
    )!;
    expect(slider).toBeDefined();
    fireEvent.change(slider, { target: { value: '90000' } });
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('loads lyrics for a selected trending track', async () => {
    render(<App />);
    const chip = screen.getByRole('button', { name: /Cruel Summer/ });
    fireEvent.click(chip);

    expect(await screen.findByText('Cruel Summer opening')).toBeInTheDocument();
    const banner = screen.getByRole('banner');
    expect(
      within(banner).getByText((_, el) =>
        el?.tagName === 'P' && (el.textContent ?? '').includes('Cruel Summer') ? true : false
      )
    ).toBeInTheDocument();
    expect(vi.mocked(fetchLyrics)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cruel-summer-taylor-swift' }),
      expect.objectContaining({ useCache: true })
    );
  });

  it('publishes media session metadata and honors play/pause/seek actions', async () => {
    render(<App />);
    const metadata = (
      navigator.mediaSession.metadata as unknown as { init: Record<string, unknown> }
    ).init;
    expect(metadata).toEqual(expect.objectContaining({ title: 'Espresso' }));

    await act(async () => {
      mediaSessionActions.pause({});
    });
    expect(screen.getByTitle('Play & sync lyrics')).toBeInTheDocument();

    await act(async () => {
      mediaSessionActions.play({});
    });
    expect(screen.getByTitle('Pause playback')).toBeInTheDocument();

    await act(async () => {
      mediaSessionActions.seekto({ seekTime: 90 });
    });
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('keeps the desktop bridge handler bound to the latest ai config', async () => {
    render(<App />);
    const first: NowPlaying = makeNowPlaying({
      title: 'City Lights',
      artist: 'Unknown',
      positionMs: 5000,
      isPlaying: true,
      durationMs: 120_000,
    });

    await act(async () => {
      bridgeBridge.onNowPlaying(first);
    });

    expect(vi.mocked(fetchLyrics)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'desktop-city-lights-unknown' }),
      expect.objectContaining({ useCache: true })
    );
    const banner = screen.getByRole('banner');
    expect(
      within(banner).getByText((_, el) =>
        el?.tagName === 'P' && (el.textContent ?? '').includes('City Lights') ? true : false
      )
    ).toBeInTheDocument();
    expect(screen.getByText('0:05')).toBeInTheDocument();

    // Same track replayed: no new lyrics fetch.
    vi.mocked(fetchLyrics).mockClear();
    await act(async () => {
      bridgeBridge.onNowPlaying({ ...first, positionMs: 10_000, isPlaying: false });
    });
    expect(vi.mocked(fetchLyrics)).not.toHaveBeenCalled();
    expect(screen.getByText('0:10')).toBeInTheDocument();
  });

  it('detects a curated desktop track by matching the curated list', async () => {
    render(<App />);
    await act(async () => {
      bridgeBridge.onNowPlaying(
        makeNowPlaying({ title: 'Blinding Lights', artist: 'The Weeknd', isPlaying: true })
      );
    });
    expect(vi.mocked(fetchLyrics)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'blinding-lights-the-weeknd' }),
      expect.anything()
    );
  });

  it('switches to sheet view via the floating window', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Full Sheet'));
    expect(screen.getByPlaceholderText('Search within lyrics...')).toBeInTheDocument();
  });

  it('runs the AI fallback save path with cache bypass', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('AI fallback options'));
    const provider = screen.getByPlaceholderText('https://api.openai.com/v1');
    const model = screen.getByPlaceholderText('gpt-4o-mini');
    const apiKey = screen.getByPlaceholderText('sk-...');

    fireEvent.click(screen.getByRole('checkbox', { checked: false }));
    await user.clear(provider);
    await user.type(provider, 'https://localhost:11434/v1');
    await user.clear(model);
    await user.type(model, 'llama3');
    await user.clear(apiKey);
    await user.type(apiKey, 'local-key');

    await user.click(screen.getByText('Save & Retry'));

    expect(vi.mocked(fetchLyrics)).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'espresso-sabrina-carpenter' }),
      expect.objectContaining({
        useCache: false,
        aiConfig: expect.objectContaining({
          providerUrl: 'https://localhost:11434/v1',
          model: 'llama3',
          apiKey: 'local-key',
          enabled: true,
        }),
      })
    );
    expect(resolveAIConfig).toHaveBeenCalled();
  });
});