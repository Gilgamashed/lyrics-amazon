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

/**
 * Renders the view with a real container + line metrics (jsdom reports zero
 * layout) and a stubbed `scrollTo`, so the follow logic can be exercised:
 * "Second lyric line" sits at y=300, "Third lyric line" at y=500, in a 200px
 * tall viewport.
 */
function followHarness() {
  const scrollTo = vi.fn();
  Object.defineProperty(Element.prototype, 'scrollTo', {
    value: scrollTo,
    configurable: true,
    writable: true,
  });

  const view = (currentTimeMs: number, autoScroll = true) => (
    <KaraokeLyricsView
      lyrics={lyrics}
      currentTimeMs={currentTimeMs}
      syncOffsetMs={0}
      fontSize="medium"
      autoScroll={autoScroll}
      onSeek={vi.fn()}
      onSelectAnnotation={vi.fn()}
      annotations={makeLyrics().annotations}
    />
  );

  const { rerender } = render(view(0));

  const container = screen.getByTestId('karaoke-scroller');
  Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });

  for (const [text, offsetTop] of [
    ['Second lyric line', 300],
    ['Third lyric line', 500],
  ] as Array<[string, number]>) {
    const el = lineDiv(text);
    Object.defineProperty(el, 'offsetTop', { value: offsetTop, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { value: 40, configurable: true });
  }

  return { rerender, container, scrollTo, view };
}

describe('KaraokeLyricsView', () => {
  it('shows the loading state while lyrics are being retrieved', () => {
    renderView({ lyrics: [], isLoading: true });
    expect(screen.getByText('Retrieving synchronized lyrics...')).toBeInTheDocument();
    expect(screen.getByText('Searching LRCLIB, Lyrica, Genius and other providers')).toBeInTheDocument();
  });

  it('shows the not-found state when the chain yields nothing', () => {
    renderView({ lyrics: [], isLoading: false });
    expect(screen.getByText('Lyrics not found')).toBeInTheDocument();
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
    fireEvent.click(screen.getByTitle('View verified info annotation'));
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

  it('auto-scrolls its own container without moving ancestors when enabled', () => {
    const scrollTo = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollTo', {
      value: scrollTo,
      configurable: true,
      writable: true,
    });
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});

    const view = (
      <KaraokeLyricsView
        lyrics={lyrics}
        currentTimeMs={0}
        syncOffsetMs={0}
        fontSize="medium"
        autoScroll
        onSeek={vi.fn()}
        onSelectAnnotation={vi.fn()}
        annotations={makeLyrics().annotations}
      />
    );
    const { rerender } = render(view);

    const active = screen.getByText('Second lyric line').closest('div.group') as HTMLElement;
    const container = active.closest('.custom-scrollbar') as HTMLElement;
    Object.defineProperty(active, 'offsetTop', { value: 300, configurable: true });
    Object.defineProperty(active, 'offsetHeight', { value: 40, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });

    // Re-render with the active line so the effect runs with layout metrics set.
    rerender(
      <KaraokeLyricsView
        lyrics={lyrics}
        currentTimeMs={3500}
        syncOffsetMs={0}
        fontSize="medium"
        autoScroll
        onSeek={vi.fn()}
        onSelectAnnotation={vi.fn()}
        annotations={makeLyrics().annotations}
      />
    );

    // 300 - 200/2 + 40/2 = 220, applied to the view's own container.
    expect(scrollTo).toHaveBeenCalledWith({ top: 220, behavior: 'smooth' });
    expect(scrollIntoView).not.toHaveBeenCalled();

    scrollIntoView.mockRestore();
  });

  it('does not scroll when auto-scroll is disabled', () => {
    const scrollTo = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollTo', {
      value: scrollTo,
      configurable: true,
      writable: true,
    });
    renderView({ currentTimeMs: 3500, autoScroll: false });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('pauses the follow when the user scrolls away and resumes once the active line is back', () => {
    const { rerender, container, scrollTo, view } = followHarness();

    // First line starts -> follow centers "Second lyric line" (300 - 100 + 20).
    rerender(view(3500));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    // The user scrolls to the top, leaving the active line out of view.
    container.scrollTop = 0;
    fireEvent.scroll(container);
    expect(screen.getByTestId('follow-active-line')).toBeInTheDocument();

    // A new line must not yank the view back while the user is browsing.
    rerender(view(5000));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    // Scrolling the active line back into view re-engages the follow.
    container.scrollTop = 400;
    fireEvent.scroll(container);
    expect(screen.queryByTestId('follow-active-line')).not.toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 420, behavior: 'smooth' });
  });

  it('re-centers the active line when the Follow control is pressed', () => {
    const { rerender, container, scrollTo, view } = followHarness();

    rerender(view(3500));
    container.scrollTop = 0;
    fireEvent.scroll(container);

    fireEvent.click(screen.getByTestId('follow-active-line'));

    expect(screen.queryByTestId('follow-active-line')).not.toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 220, behavior: 'smooth' });
  });

  it('never shows the Follow control while auto-scroll is off', () => {
    const { rerender, container, scrollTo, view } = followHarness();

    rerender(view(3500, false));
    container.scrollTop = 0;
    fireEvent.scroll(container);

    expect(screen.queryByTestId('follow-active-line')).not.toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});