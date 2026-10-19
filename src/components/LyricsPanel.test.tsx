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

  it('bounds its own height so the lyric surfaces can scroll', () => {
    const { container } = renderPanel();
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('h-full');
    expect(panel.className).toContain('min-h-0');
    expect(panel.className).toContain('overflow-hidden');
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

  const plainOnly = () =>
    makeLyrics({ syncedLyrics: [], plainLyrics: 'Line one\nLine two', provider: 'Genius' });

  it('hides the AI karaoke banner when synced lyrics are present', () => {
    renderPanel({ onGenerateKaraoke: vi.fn() });
    expect(screen.queryByTestId('karaoke-ai-banner')).not.toBeInTheDocument();
  });

  it('shows a disabled Generate Karaoke button until the endpoint is configured', () => {
    renderPanel({ lyricsData: plainOnly(), onGenerateKaraoke: vi.fn() });
    const button = screen.getByTestId('generate-karaoke');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Generate Karaoke (AI)');
  });

  it('invokes generate when configured and clicked', () => {
    const onGenerateKaraoke = vi.fn();
    renderPanel({
      lyricsData: plainOnly(),
      onGenerateKaraoke,
      karaokeAIConfigured: true,
    });
    fireEvent.click(screen.getByTestId('generate-karaoke'));
    expect(onGenerateKaraoke).toHaveBeenCalledOnce();
  });

  it('shows progress and cancels an in-flight generation', () => {
    const onCancelKaraoke = vi.fn();
    renderPanel({
      lyricsData: plainOnly(),
      onGenerateKaraoke: vi.fn(),
      onCancelKaraoke,
      karaokeAIConfigured: true,
      karaokeAIStatus: 'aligning',
    });
    expect(screen.getByTestId('karaoke-ai-progress')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onCancelKaraoke).toHaveBeenCalledOnce();
  });

  it('offers a retry after an error and a saved confirmation', () => {
    const { rerender } = renderPanel({
      lyricsData: plainOnly(),
      onGenerateKaraoke: vi.fn(),
      karaokeAIConfigured: true,
      karaokeAIStatus: 'error',
      karaokeAIMessage: 'Alignment request failed.',
    });
    expect(screen.getByText('Alignment request failed.')).toBeInTheDocument();
    expect(screen.getByTestId('generate-karaoke')).toHaveTextContent('Retry');

    rerender(
      <LyricsPanel
        lyricsData={plainOnly()}
        currentTimeMs={0}
        syncOffsetMs={0}
        onOffsetChange={vi.fn()}
        windowState={makeWindowState()}
        onUpdateWindowState={vi.fn()}
        onSeek={vi.fn()}
        onGenerateKaraoke={vi.fn()}
        karaokeAIConfigured
        karaokeAIStatus="done"
        layoutWidth={680}
      />
    );
    expect(screen.getByText('Karaoke generated')).toBeInTheDocument();
  });
});
