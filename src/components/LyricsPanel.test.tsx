import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LyricsPanel } from './LyricsPanel';
import { makeLyrics, makeWindowState } from '../test/fixtures';

type Props = Parameters<typeof LyricsPanel>[0];

function renderPanel(overrides: Partial<Props> = {}) {
  const onOffsetChange = vi.fn();
  const onUpdateWindowState = vi.fn();
  const onSeek = vi.fn();
  const onThumbsUp = vi.fn();
  const onThumbsDown = vi.fn();
  const utils = render(
    <LyricsPanel
      lyricsData={makeLyrics()}
      currentTimeMs={0}
      syncOffsetMs={0}
      onOffsetChange={onOffsetChange}
      windowState={makeWindowState()}
      onUpdateWindowState={onUpdateWindowState}
      onSeek={onSeek}
      onThumbsUp={onThumbsUp}
      onThumbsDown={onThumbsDown}
      layoutWidth={680}
      {...overrides}
    />
  );
  return { onOffsetChange, onUpdateWindowState, onThumbsUp, onThumbsDown, onSeek, ...utils };
}

describe('LyricsPanel', () => {
  it('renders provider and parsed line count', () => {
    renderPanel();
    expect(screen.getByText('Provider: Genius')).toBeInTheDocument();
    expect(screen.getByText('3 lines parsed')).toBeInTheDocument();
  });

  it('toggles the view mode', () => {
    const { onUpdateWindowState } = renderPanel();
    fireEvent.click(screen.getByText('Full Sheet'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ viewMode: 'sheet' });
  });

  it('renders the full sheet when the mode is sheet', () => {
    renderPanel({ windowState: makeWindowState({ viewMode: 'sheet' }) });
    expect(screen.getByPlaceholderText('Search within lyrics...')).toBeInTheDocument();
  });

  it('calibrates the sync offset', () => {
    const { onOffsetChange } = renderPanel();
    fireEvent.click(screen.getByTitle(/Calibrate lyric sync offset/));
    fireEvent.click(screen.getByText('+0.5s'));
    expect(onOffsetChange).toHaveBeenCalledWith(500);
    fireEvent.click(screen.getByText('Reset'));
    expect(onOffsetChange).toHaveBeenCalledWith(0);
  });

  it('shows a non-zero offset label', () => {
    renderPanel({ syncOffsetMs: 1200 });
    expect(screen.getByText('+1.2s')).toBeInTheDocument();
  });

  it('opens the Info drawer', () => {
    renderPanel();
    fireEvent.click(screen.getByTitle('Artist, album and lyrics info'));
    expect(screen.getByText('Song & Album')).toBeInTheDocument();
  });

  it('reports feedback via the thumbs buttons', () => {
    const { onThumbsUp, onThumbsDown } = renderPanel();
    fireEvent.click(screen.getByTestId('thumbs-up'));
    fireEvent.click(screen.getByTestId('thumbs-down'));
    expect(onThumbsUp).toHaveBeenCalledOnce();
    expect(onThumbsDown).toHaveBeenCalledOnce();
  });

  it('toggles auto-scroll', () => {
    const { onUpdateWindowState } = renderPanel();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ autoScroll: false });
  });
});
