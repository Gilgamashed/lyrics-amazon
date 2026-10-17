import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NowPlayingHeader } from './NowPlayingHeader';
import { makeSong } from '../test/fixtures';

type Props = Parameters<typeof NowPlayingHeader>[0];

function renderHeader(overrides: Partial<Props> = {}) {
  const onToggleHistory = vi.fn();
  const utils = render(
    <NowPlayingHeader
      song={makeSong({ title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n\' Sweet' })}
      detectionSource="browser"
      historyActive={false}
      onToggleHistory={onToggleHistory}
      {...overrides}
    />
  );
  return { onToggleHistory, ...utils };
}

describe('NowPlayingHeader', () => {
  it('renders the track lockup and album art', () => {
    renderHeader({ song: makeSong({ albumArt: 'https://img/cover.jpg' }) });
    const banner = screen.getByRole('banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByText('Espresso')).toBeInTheDocument();
    expect(screen.getByText(/Sabrina Carpenter/)).toBeInTheDocument();
    expect(screen.getByAltText('Espresso')).toHaveAttribute('src', 'https://img/cover.jpg');
  });

  it('falls back to an icon when no art is present', () => {
    renderHeader({ song: makeSong({ albumArt: '' }) });
    expect(screen.queryByAltText('Espresso')).not.toBeInTheDocument();
  });

  it('shows the detection source chip', () => {
    const { rerender } = renderHeader();
    expect(screen.getByText('Browser (Media Session)')).toBeInTheDocument();

    rerender(
      <NowPlayingHeader
        song={makeSong()}
        detectionSource="desktop"
        historyActive={false}
        onToggleHistory={() => {}}
      />
    );
    expect(screen.getByText('Desktop (native)')).toBeInTheDocument();
  });

  it('toggles Most Listened', () => {
    const { onToggleHistory } = renderHeader();
    const toggle = screen.getByTitle('Most Listened');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(onToggleHistory).toHaveBeenCalledOnce();
  });

  it('reflects the active history state', () => {
    renderHeader({ historyActive: true });
    expect(screen.getByTitle('Most Listened')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the options slot and a loading indicator', () => {
    renderHeader({ isLoading: true, optionsMenu: <span>menu-slot</span> });
    expect(screen.getByText('menu-slot')).toBeInTheDocument();
  });

  it('surfaces the detected app id in the desktop chip tooltip', () => {
    renderHeader({ detectionSource: 'desktop', appId: 'AmazonMusic.exe' });
    expect(screen.getByTestId('detection-chip')).toHaveAttribute(
      'title',
      'Detecting playback from the native desktop bridge (Amazon Music app) · app id: AmazonMusic.exe'
    );
  });

  it('omits the app id when none is reported', () => {
    renderHeader({ detectionSource: 'desktop', appId: null });
    expect(screen.getByTestId('detection-chip')).toHaveAttribute(
      'title',
      'Detecting playback from the native desktop bridge (Amazon Music app)'
    );
  });

  it('hides the fix control unless the desktop bridge can edit metadata', () => {
    renderHeader();
    expect(screen.queryByLabelText('Fix song or artist name')).not.toBeInTheDocument();
  });

  it('opens the correction dialog pre-filled and applies a correction', () => {
    const onEditMetadata = vi.fn();
    renderHeader({
      detectionSource: 'desktop',
      onEditMetadata,
      song: makeSong({ title: 'Artist name', artist: 'oktobernatt' }),
    });

    fireEvent.click(screen.getByLabelText('Fix song or artist name'));
    const titleInput = screen.getByLabelText('Song name') as HTMLInputElement;
    const artistInput = screen.getByLabelText('Artist') as HTMLInputElement;
    expect(titleInput.value).toBe('Artist name');
    expect(artistInput.value).toBe('oktobernatt');

    fireEvent.change(titleInput, { target: { value: 'Rasa' } });
    fireEvent.click(screen.getByText('Search again'));

    expect(onEditMetadata).toHaveBeenCalledWith('Rasa', 'oktobernatt');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables apply for a blank title and cancels the dialog', () => {
    const onEditMetadata = vi.fn();
    renderHeader({ detectionSource: 'desktop', onEditMetadata });

    fireEvent.click(screen.getByLabelText('Fix song or artist name'));
    fireEvent.change(screen.getByLabelText('Song name'), { target: { value: '   ' } });
    expect(screen.getByText('Search again')).toBeDisabled();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onEditMetadata).not.toHaveBeenCalled();
  });

  it('shows revert only when an override exists and invokes it', () => {
    const onRevertOverride = vi.fn();
    renderHeader({ detectionSource: 'desktop', onEditMetadata: vi.fn(), hasOverride: true, onRevertOverride });

    fireEvent.click(screen.getByLabelText('Fix song or artist name'));
    fireEvent.click(screen.getByText('Revert'));
    expect(onRevertOverride).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not render revert without an override', () => {
    renderHeader({ detectionSource: 'desktop', onEditMetadata: vi.fn(), hasOverride: false });
    fireEvent.click(screen.getByLabelText('Fix song or artist name'));
    expect(screen.queryByText('Revert')).not.toBeInTheDocument();
  });
});
