import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AmazonMusicBar } from './AmazonMusicBar';
import { searchTracks } from '../services/lyricsService';
import { CURATED_TRACKS } from '../services/curatedTracks';
import { makeSong, AI_CONFIG_OFF } from '../test/fixtures';

vi.mock('../services/lyricsService', () => ({
  searchTracks: vi.fn(),
}));

function renderBar(props: Partial<Parameters<typeof AmazonMusicBar>[0]> = {}) {
  const onTogglePlay = vi.fn();
  const onSeek = vi.fn();
  const onOffsetChange = vi.fn();
  const onSelectSong = vi.fn();
  const onToggleMediaSession = vi.fn();
  const onSaveAIConfig = vi.fn();

  render(
    <AmazonMusicBar
      currentSong={CURATED_TRACKS[0]}
      isPlaying
      currentTimeMs={0}
      syncOffsetMs={0}
      isMediaSessionActive
      detectionSource="browser"
      aiConfig={AI_CONFIG_OFF}
      onTogglePlay={onTogglePlay}
      onSeek={onSeek}
      onOffsetChange={onOffsetChange}
      onSelectSong={onSelectSong}
      onToggleMediaSession={onToggleMediaSession}
      onSaveAIConfig={onSaveAIConfig}
      {...props}
    />
  );

  return { onTogglePlay, onSeek, onOffsetChange, onSelectSong, onToggleMediaSession, onSaveAIConfig };
}

describe('AmazonMusicBar', () => {
  beforeEach(() => {
    vi.mocked(searchTracks).mockReset();
  });

  it('renders brand, current song and formatted times', () => {
    renderBar({ currentTimeMs: 90_000 });
    expect(screen.getByText('Amazon Music')).toBeInTheDocument();
    const p = within(screen.getByRole('banner')).getByText((_, el) =>
      el?.tagName === 'P' && (el.textContent ?? '').includes(CURATED_TRACKS[0].title)
        ? true
        : false
    );
    expect(p).toBeInTheDocument();
    expect(screen.getByText('1:30')).toBeInTheDocument();
    expect(screen.getByText('2:55')).toBeInTheDocument();
  });

  it('toggles play/pause and reports the active state', () => {
    const { onTogglePlay } = renderBar();
    fireEvent.click(screen.getByTitle('Pause playback'));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);

    renderBar({ isPlaying: false });
    fireEvent.click(screen.getByTitle('Play & sync lyrics'));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('seeks from the range slider', () => {
    const { onSeek } = renderBar();
    const slider = screen.getAllByRole('slider').find((el) =>
      el.className.includes('accent-cyan-400')
    )!;
    fireEvent.change(slider, { target: { value: '45000' } });
    expect(onSeek).toHaveBeenCalledWith(45000);
  });

  it('exposes sync-offset presets and a reset', () => {
    const { onOffsetChange } = renderBar({ syncOffsetMs: 2500 });

    fireEvent.click(screen.getByTitle(/Calibrate lyric sync offset/));
    expect(screen.getByText('Lyrics Timing Calibration')).toBeInTheDocument();
    expect(screen.getByText('+2.5s')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+0.5s'));
    expect(onOffsetChange).toHaveBeenLastCalledWith(3000);

    fireEvent.click(screen.getByText('-0.1s'));
    expect(onOffsetChange).toHaveBeenLastCalledWith(2400);

    fireEvent.click(screen.getByText('Reset'));
    expect(onOffsetChange).toHaveBeenLastCalledWith(0);
  });

  it('handles the media session auto-detect toggle', () => {
    const { onToggleMediaSession } = renderBar();
    fireEvent.click(screen.getByText('Auto-Detect On'));
    expect(onToggleMediaSession).toHaveBeenCalled();

    renderBar({ isMediaSessionActive: false });
    expect(screen.getByText('Auto-Detect')).toBeInTheDocument();
  });

  it('renders the detection source indicator for both sources', () => {
    renderBar({ detectionSource: 'desktop' });
    expect(screen.getByText('Desktop (native)')).toBeInTheDocument();

    renderBar({ detectionSource: 'browser' });
    expect(screen.getByText('Browser (Media Session)')).toBeInTheDocument();
  });

  it('searches as the user types and selects a result', async () => {
    const user = userEvent.setup();
    const remote = makeSong({ id: 'lrc-1', title: 'Remote Hit', artist: 'Remote Artist', durationMs: 210_000 });
    vi.mocked(searchTracks).mockResolvedValue([remote]);
    const { onSelectSong } = renderBar();

    await user.type(screen.getByPlaceholderText(/Search Amazon Music track/), 'remote');
    expect(searchTracks).toHaveBeenCalledWith('remote');

    const result = await screen.findByText('Remote Hit');
    expect(screen.getByText('Matching Tracks')).toBeInTheDocument();
    await user.click(result);

    expect(onSelectSong).toHaveBeenCalledWith(remote);
    expect(screen.queryByText('Matching Tracks')).not.toBeInTheDocument();
  });

  it('shows the empty state when the search has no results', async () => {
    const user = userEvent.setup();
    vi.mocked(searchTracks).mockResolvedValue([]);
    renderBar();

    await user.type(screen.getByPlaceholderText(/Search Amazon Music track/), 'zzz');
    expect(await screen.findByText(/No matching tracks/)).toBeInTheDocument();
  });

  it('clears the query via the clear button', async () => {
    const user = userEvent.setup();
    vi.mocked(searchTracks).mockResolvedValue([makeSong({ id: 'x' })]);
    renderBar();

    const input = screen.getByPlaceholderText(/Search Amazon Music track/);
    await user.type(input, 'es');
    await screen.findByText('Matching Tracks');

    await user.click(screen.getByText('✕'));
    expect(screen.queryByText('Matching Tracks')).not.toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('supports the enter-to-search form path', async () => {
    const user = userEvent.setup();
    vi.mocked(searchTracks).mockResolvedValue([]);
    renderBar();

    const input = screen.getByPlaceholderText(/Search Amazon Music track/);
    await user.type(input, 'direct');
    await user.keyboard('{Enter}');
    expect(searchTracks).toHaveBeenCalledWith('direct');
    expect(await screen.findByText(/No matching tracks/)).toBeInTheDocument();
  });

  it('selects a trending curated track', () => {
    const { onSelectSong } = renderBar();
    const chip = screen.getByRole('button', { name: new RegExp(CURATED_TRACKS[1].title) });
    fireEvent.click(chip);
    expect(onSelectSong).toHaveBeenCalledWith(CURATED_TRACKS[1]);
  });
});