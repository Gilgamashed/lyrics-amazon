import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KaraokeLyricsView } from './KaraokeLyricsView';
import { makeLyrics } from '../test/fixtures';

type Props = Parameters<typeof KaraokeLyricsView>[0];

const lyrics = makeLyrics().syncedLyrics;

function renderView(overrides: Partial<Props> = {}) {
  const onSeek = vi.fn();
  const onSelectAnnotation = vi.fn();
  render(
    <KaraokeLyricsView
      lyrics={lyrics}
      currentTimeMs={0}
      syncOffsetMs={0}
      fontSize="medium"
      autoScroll={false}
      onSeek={onSeek}
      onSelectAnnotation={onSelectAnnotation}
      annotations={makeLyrics().annotations}
      {...overrides}
    />
  );
  return { onSeek, onSelectAnnotation };
}

function lineDiv(text: string): HTMLElement {
  return screen.getByText(text).closest('div.group')!;
}

function lineP(text: string): HTMLElement {
  return screen.getByText(text).closest('p')!;
}

describe('KaraokeLyricsView', () => {
  it('shows the loading state for empty lyrics', () => {
    renderView({ lyrics: [] });
    expect(screen.getByText('Retrieving synchronized lyrics...')).toBeInTheDocument();
    expect(screen.getByText('Connecting to Genius and LRCLIB audio providers')).toBeInTheDocument();
  });

  it('marks the last started line as active and the rest as past/upcoming', () => {
    renderView({ currentTimeMs: 3500 });
    expect(lineDiv('Second lyric line').className).toContain('scale-[1.02]');
    expect(lineP('First lyric line').className).toContain('text-slate-400/50');
    expect(lineP('Third lyric line').className).toContain('text-slate-300/80');
  });

  it('applies a negative sync offset when computing the active line', () => {
    renderView({ currentTimeMs: 2900, syncOffsetMs: -1000 });
    expect(lineDiv('First lyric line').className).toContain('scale-[1.02]');
  });

  it('applies a positive sync offset when computing the active line', () => {
    renderView({ currentTimeMs: 900, syncOffsetMs: 200 });
    expect(lineDiv('First lyric line').className).toContain('scale-[1.02]');
  });

  it('activates nothing before the first timestamp', () => {
    renderView({ currentTimeMs: 0 });
    expect(lineDiv('First lyric line').className).not.toContain('scale-[1.02]');
  });

  it('seeks when a line is clicked', () => {
    const { onSeek } = renderView();
    fireEvent.click(lineDiv('Third lyric line'));
    expect(onSeek).toHaveBeenCalledWith(5000);
  });

  it('opens an annotation without also seeking', () => {
    const { onSelectAnnotation, onSeek } = renderView();
    fireEvent.click(screen.getByTitle('View Genius verified annotation'));
    expect(onSelectAnnotation).toHaveBeenCalledWith('ann-2');
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('renders section labels for non-verse lines', () => {
    renderView();
    expect(screen.getByText('intro')).toBeInTheDocument();
    expect(screen.getByText('chorus')).toBeInTheDocument();
  });

  it('switches font size classes per setting', () => {
    const cases: Array<{ fontSize: Props['fontSize']; active: string; inactive: string }> = [
      { fontSize: 'medium', active: 'text-2xl', inactive: 'text-lg' },
      { fontSize: 'small', active: 'text-xl', inactive: 'text-base' },
      { fontSize: 'large', active: 'text-3xl', inactive: 'text-2xl' },
      { fontSize: 'xlarge', active: 'text-4xl', inactive: 'text-3xl' },
    ];

    for (const c of cases) {
      renderView({ currentTimeMs: 9000, fontSize: c.fontSize });
      const last = screen.getAllByText('Third lyric line').at(-1)!;
      expect(last.closest('p')!.className).toContain(c.active);
      expect(last.closest('p')!.className).not.toContain(c.inactive);
    }
  });

  it('auto-scrolls to the active line when enabled', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    renderView({ currentTimeMs: 3500, autoScroll: true });
    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    spy.mockRestore();
  });
});