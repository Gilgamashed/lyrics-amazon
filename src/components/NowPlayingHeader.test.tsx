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
});
