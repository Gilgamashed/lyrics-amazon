import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManualSyncLyricsView } from './ManualSyncLyricsView';
import { ManualSyncLine, manualSyncLines } from '../services/manualSync';

type Props = Parameters<typeof ManualSyncLyricsView>[0];

const TEXT = 'First line\nSecond line\nThird line';

function line(id: string, text: string, startTimeMs: number | null = null): ManualSyncLine {
  return { id, text, startTimeMs };
}

/**
 * Renders the surface with real container + row metrics (jsdom reports zero
 * layout) and a stubbed `scrollTo`, so the centering math can be asserted.
 * Row `i` sits at y = i * 200 in a 200px-tall viewport.
 */
function syncHarness(overrides: Partial<Props> = {}) {
  const scrollTo = vi.fn();
  Object.defineProperty(Element.prototype, 'scrollTo', {
    value: scrollTo,
    configurable: true,
    writable: true,
  });

  const view = (props: Partial<Props> = {}) => (
    <ManualSyncLyricsView
      lines={manualSyncLines(TEXT)}
      pointer={0}
      state="syncing"
      status="Syncing - line 1/3 (0 stamped)"
      fontSize="medium"
      autoScroll
      {...overrides}
      {...props}
    />
  );

  const { rerender } = render(view());

  const container = screen.getByTestId('manual-sync-scroller');
  Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });

  for (const [index, el] of screen.getAllByTestId('manual-sync-line').entries()) {
    Object.defineProperty(el, 'offsetTop', { value: index * 200, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { value: 40, configurable: true });
  }

  return { rerender, view, scrollTo, container };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ManualSyncLyricsView', () => {
  it('lists every session line', () => {
    render(
      <ManualSyncLyricsView
        lines={manualSyncLines(TEXT)}
        pointer={0}
        state="syncing"
        status="Syncing"
        fontSize="medium"
        autoScroll={false}
      />
    );

    expect(screen.getAllByTestId('manual-sync-line')).toHaveLength(3);
    expect(screen.getByText('First line')).toBeInTheDocument();
    expect(screen.getByText('Third line')).toBeInTheDocument();
  });

  it('marks the pointer line as next without activating it on a fresh session', () => {
    render(
      <ManualSyncLyricsView
        lines={manualSyncLines(TEXT)}
        pointer={1}
        state="syncing"
        status="Syncing"
        fontSize="medium"
        autoScroll={false}
      />
    );

    const rows = screen.getAllByTestId('manual-sync-line');
    expect(rows[0]).not.toHaveAttribute('data-next');
    expect(rows[1]).toHaveAttribute('data-next', 'true');
    expect(rows[1]).toHaveTextContent('Next');
    // Nothing has been stamped yet, so nothing glows.
    expect(rows[1]).not.toHaveAttribute('data-active');
    expect(rows[1]).not.toHaveAttribute('aria-current');
    expect(screen.queryByTestId('manual-sync-stamp')).not.toBeInTheDocument();
  });

  it('activates the pointer line once a line has been stamped', () => {
    const lines = manualSyncLines(TEXT);
    lines[0].startTimeMs = 1000;

    render(
      <ManualSyncLyricsView
        lines={lines}
        pointer={1}
        state="syncing"
        status="Syncing"
        fontSize="medium"
        autoScroll={false}
      />
    );

    const rows = screen.getAllByTestId('manual-sync-line');
    expect(rows[1]).toHaveAttribute('data-next', 'true');
    expect(rows[1]).toHaveAttribute('data-active', 'true');
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    // The recorded line is dimmed and keeps its chip.
    expect(rows[0]).not.toHaveAttribute('data-active');
    expect(rows[0]).toHaveClass('opacity-45');
  });

  it('keeps the cue and the chip on the stamped last line', () => {
    const lines = manualSyncLines(TEXT);
    lines[2].startTimeMs = 12_000;

    render(
      <ManualSyncLyricsView
        lines={lines}
        pointer={2}
        state="syncing"
        status="Syncing"
        fontSize="medium"
        autoScroll={false}
      />
    );

    const last = screen.getAllByTestId('manual-sync-line')[2];
    expect(last).toHaveAttribute('data-next', 'true');
    expect(last).toHaveAttribute('data-active', 'true');
    expect(last).toHaveTextContent('0:12.0');
  });

  it('moves the active highlight when the pointer advances', () => {
    const lines = manualSyncLines(TEXT);
    lines[0].startTimeMs = 1000;
    const { rerender, view } = syncHarness({ lines, pointer: 1 });

    expect(screen.getAllByTestId('manual-sync-line')[1]).toHaveAttribute('data-active', 'true');

    rerender(view({ pointer: 2 }));

    const rows = screen.getAllByTestId('manual-sync-line');
    expect(rows[1]).not.toHaveAttribute('data-active');
    expect(rows[2]).toHaveAttribute('data-active', 'true');
  });

  it('centers the highlighted line on every pointer change', () => {
    const { rerender, view, scrollTo } = syncHarness();
    scrollTo.mockClear();

    // Row 1 at y=200, 40px tall, in a 200px viewport -> 200 - 100 + 20 = 120.
    rerender(view({ pointer: 1 }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 120, behavior: 'smooth' });
  });

  it('does not move the view when Auto-Scroll is off', () => {
    const { rerender, view, scrollTo } = syncHarness({ autoScroll: false });

    rerender(view({ pointer: 2 }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('clamps an out-of-range pointer to the last line', () => {
    render(
      <ManualSyncLyricsView
        lines={manualSyncLines(TEXT)}
        pointer={99}
        state="syncing"
        status="Syncing"
        fontSize="medium"
        autoScroll={false}
      />
    );

    const rows = screen.getAllByTestId('manual-sync-line');
    expect(rows[2]).toHaveAttribute('data-next', 'true');
  });

  it('shows a time chip on stamped lines', () => {
    render(
      <ManualSyncLyricsView
        lines={[line('m0', 'Stamped line', 65_400), line('m1', 'Waiting line')]}
        pointer={1}
        state="syncing"
        status="Syncing"
        fontSize="medium"
        autoScroll={false}
      />
    );

    expect(screen.getByTestId('manual-sync-stamp')).toHaveTextContent('1:05.4');
    expect(screen.getAllByTestId('manual-sync-line')[0]).toHaveClass('opacity-45');
  });

  it('shows the status strip and the key hint', () => {
    render(
      <ManualSyncLyricsView
        lines={manualSyncLines(TEXT)}
        pointer={0}
        state="syncing"
        status="Syncing - line 1/3 (0 stamped)"
        fontSize="medium"
        autoScroll={false}
      />
    );

    expect(screen.getByTestId('manual-sync-status')).toHaveTextContent(
      'Syncing - line 1/3 (0 stamped)'
    );
    expect(screen.getByText(/Backspace \/ Up: step back/)).toBeInTheDocument();
  });

  it('offers no lyrics search or copy action', () => {
    render(
      <ManualSyncLyricsView
        lines={manualSyncLines(TEXT)}
        pointer={0}
        state="syncing"
        status="Syncing"
        fontSize="medium"
        autoScroll={false}
      />
    );

    expect(screen.queryByPlaceholderText('Search within lyrics...')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy Sheet')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('supports every font size', () => {
    const { rerender, view } = syncHarness({ autoScroll: false });

    for (const fontSize of ['small', 'medium', 'large', 'xlarge'] as const) {
      rerender(view({ fontSize }));
      expect(screen.getAllByTestId('manual-sync-line')).toHaveLength(3);
    }
  });

  it('falls back to scrollTop when smooth scrolling is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
    Object.defineProperty(Element.prototype, 'scrollTo', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const lines = manualSyncLines(TEXT);
      const surface = (pointer: number) => (
        <ManualSyncLyricsView
          lines={lines}
          pointer={pointer}
          state="syncing"
          status="Syncing"
          fontSize="medium"
          autoScroll
        />
      );

      const { rerender } = render(surface(0));
      const container = screen.getByTestId('manual-sync-scroller');
      Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
      for (const [index, el] of screen.getAllByTestId('manual-sync-line').entries()) {
        Object.defineProperty(el, 'offsetTop', { value: index * 200, configurable: true });
        Object.defineProperty(el, 'offsetHeight', { value: 40, configurable: true });
      }

      rerender(surface(1));

      expect(container.scrollTop).toBe(120);
    } finally {
      if (original) {
        Object.defineProperty(Element.prototype, 'scrollTo', original);
      } else {
        delete (Element.prototype as { scrollTo?: unknown }).scrollTo;
      }
    }
  });

  it('renders a fallback when the session has no lines', () => {
    render(
      <ManualSyncLyricsView
        lines={[]}
        pointer={0}
        state="syncing"
        status="Ready (0 lines)"
        fontSize="medium"
        autoScroll={false}
      />
    );

    expect(screen.getByText('No lyric lines to sync.')).toBeInTheDocument();
    expect(screen.queryByTestId('manual-sync-line')).not.toBeInTheDocument();
  });
});
