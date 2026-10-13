import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullSheetLyricsView } from './FullSheetLyricsView';
import { makeLyrics } from '../test/fixtures';

function renderView(overrides: Partial<Parameters<typeof FullSheetLyricsView>[0]> = {}) {
  const onSeek = vi.fn();
  const data = makeLyrics();
  render(
    <FullSheetLyricsView
      lyrics={data.syncedLyrics}
      plainLyrics={data.plainLyrics}
      songTitle={data.title}
      artist={data.artist}
      fontSize="medium"
      onSeek={onSeek}
      {...overrides}
    />
  );
  return { onSeek };
}

describe('FullSheetLyricsView', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders every lyric line with section hints and timestamp buttons', () => {
    renderView();
    expect(screen.getByText('First lyric line')).toBeInTheDocument();
    expect(screen.getByText('[intro]')).toBeInTheDocument();
    expect(screen.getByText('[chorus]')).toBeInTheDocument();
    // 5000ms -> 0:05, 3000ms -> 0:03, 90000ms -> 1:30 not present here.
    expect(screen.getByText('0:05')).toBeInTheDocument();
  });

  it('seeks when a line is clicked', () => {
    const { onSeek } = renderView();
    fireEvent.click(screen.getByText('Third lyric line').closest('div.group')!);
    expect(onSeek).toHaveBeenCalledWith(5000);
  });

  it('copies plain lyrics with a title/artist header and reverts the label', () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderView();
    fireEvent.click(screen.getByTitle('Copy lyrics to clipboard'));
    expect(writeText).toHaveBeenCalledWith(
      'Espresso - Sabrina Carpenter\n\nFirst lyric line\nSecond lyric line\nThird lyric line'
    );
    expect(screen.getByText('Copied')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByText('Copy Sheet')).toBeInTheDocument();
  });

  it('falls back to joined lyric lines when plain lyrics are empty', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderView({ plainLyrics: '' });
    fireEvent.click(screen.getByTitle('Copy lyrics to clipboard'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('First lyric line\nSecond lyric line\nThird lyric line'));
  });

  it('highlights search matches inside the lyric text', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByPlaceholderText('Search within lyrics...'), 'Second lyric');
    const highlighted = screen.getAllByText('Second lyric');
    expect(highlighted.length).toBeGreaterThan(0);
    expect(highlighted[0].className).toContain('bg-cyan-500/30');
  });

  it('marks matching containers and ignores case', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByPlaceholderText('Search within lyrics...'), 'seC');
    // getNodeText inspects only direct text nodes, so resolve the line by content.
    const line = screen.getByText((_, el) =>
      el?.tagName === 'P' && (el.textContent ?? '').startsWith('Second lyric line') ? true : false
    );
    expect(line.closest('div.group')!.className).toContain('bg-cyan-950/40');

    const match = screen.getAllByText('Sec');
    expect(match.length).toBeGreaterThan(0);
    expect(match[0].className).toContain('bg-cyan-500/30');
  });
});