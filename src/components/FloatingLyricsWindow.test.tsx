import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingLyricsWindow } from './FloatingLyricsWindow';
import { makeLyrics, makeWindowState } from '../test/fixtures';

let innerWidth = 1280;
let innerHeight = 800;

function renderWindow(overrides: Partial<Parameters<typeof FloatingLyricsWindow>[0]> = {}) {
  const onUpdateWindowState = vi.fn();
  const onSeek = vi.fn();
  const data = makeLyrics();
  const windowState = makeWindowState();

  render(
    <FloatingLyricsWindow
      windowState={windowState}
      lyricsData={data}
      currentTimeMs={0}
      syncOffsetMs={0}
      onUpdateWindowState={onUpdateWindowState}
      onSeek={onSeek}
      {...overrides}
    />
  );

  return { onUpdateWindowState, onSeek, windowState };
}

describe('FloatingLyricsWindow', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
  });

  it('renders the karaoke lyrics and status bar', () => {
    renderWindow({ currentTimeMs: 3500 });
    expect(screen.getByText('Second lyric line')).toBeInTheDocument();
    expect(screen.getByText(/Provider: Genius/)).toBeInTheDocument();
    expect(screen.getByText('3 lines parsed')).toBeInTheDocument();
  });

  it('fires the thumbs feedback callbacks', () => {
    const onThumbsUp = vi.fn();
    const onThumbsDown = vi.fn();
    renderWindow({ onThumbsUp, onThumbsDown });

    fireEvent.click(screen.getByTestId('thumbs-up'));
    expect(onThumbsUp).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('thumbs-down'));
    expect(onThumbsDown).toHaveBeenCalledTimes(1);
  });

  it('reflects the selected feedback state via aria-pressed', () => {
    renderWindow({ feedbackState: 'down', onThumbsUp: vi.fn(), onThumbsDown: vi.fn() });
    expect(screen.getByTestId('thumbs-down')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('thumbs-up')).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables feedback controls while lyrics are loading', () => {
    renderWindow({ isLoadingLyrics: true, onThumbsUp: vi.fn(), onThumbsDown: vi.fn() });
    expect(screen.getByTestId('thumbs-up')).toBeDisabled();
    expect(screen.getByTestId('thumbs-down')).toBeDisabled();
  });

  it('renders the minimized pill and restores the window', () => {
    const state = makeWindowState({ isMinimized: true });
    const { onUpdateWindowState } = renderWindow({ windowState: state });

    expect(screen.getByText(/Lyrics: Espresso/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Restore window'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ isMinimized: false });
  });

  it('minimizes, toggles pin and maximizes from the title controls', () => {
    const { onUpdateWindowState } = renderWindow();

    fireEvent.click(screen.getByTitle('Minimize to floating pill'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ isMinimized: true });

    fireEvent.click(screen.getByTitle('Toggle pin / always on top'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ isPinned: false });

    fireEvent.click(screen.getByTitle('Toggle maximize'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ isMaximized: true });
  });

  it('switches to the full sheet view from the segmented control', () => {
    const { onUpdateWindowState } = renderWindow();
    fireEvent.click(screen.getByText('Full Sheet'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ viewMode: 'sheet' });
  });

  it('renders the full sheet view and can switch back to karaoke', () => {
    const sheet = renderWindow({ windowState: makeWindowState({ viewMode: 'sheet' }) });
    expect(screen.getByPlaceholderText('Search within lyrics...')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Karaoke (Synced)'));
    expect(sheet.onUpdateWindowState).toHaveBeenCalledWith({ viewMode: 'karaoke' });
  });

  it('toggles the annotations drawer', () => {
    const { onUpdateWindowState } = renderWindow();
    fireEvent.click(screen.getByTitle('Genius verified notes and trivia'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ showAnnotations: true });

    renderWindow({ windowState: makeWindowState({ showAnnotations: true }) });
    expect(screen.getByText('Genius Insights & Annotations')).toBeInTheDocument();
  });

  it('opens the settings menu and drives opacity, blur, font size and theme', () => {
    const { onUpdateWindowState } = renderWindow();

    fireEvent.click(screen.getByTitle('Window appearance & glass translucency settings'));
    expect(screen.getByText('Glass Window Controls')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();

    const [opacity, blur] = screen.getAllByRole('slider', { hidden: true });
    fireEvent.change(opacity, { target: { value: '0.75' } });
    expect(onUpdateWindowState).toHaveBeenCalledWith({ opacity: 0.75 });

    fireEvent.change(blur, { target: { value: '8' } });
    expect(onUpdateWindowState).toHaveBeenCalledWith({ blur: 8 });

    fireEvent.click(screen.getByText('XL'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ fontSize: 'xlarge' });

    fireEvent.click(screen.getByText('Cyan Cyber'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ theme: 'cyan' });
  });

  it('toggles auto-scroll and tracks the pinned state', () => {
    const { onUpdateWindowState } = renderWindow();

    const autoScroll = screen.getByLabelText(/Auto-Scroll/);
    fireEvent.click(autoScroll);
    expect(onUpdateWindowState).toHaveBeenCalledWith({ autoScroll: false });

    fireEvent.click(screen.getByTitle('Unpin window'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ isPinned: false });
  });

  it('hides the resize handles when maximized', () => {
    renderWindow({ windowState: makeWindowState({ isMaximized: true }) });
    expect(document.querySelector('.cursor-se-resize')).toBeNull();
  });

  it('drags the window from the title bar with clamping', () => {
    const state = makeWindowState({ x: 300, y: 200, isPinned: false });
    const { onUpdateWindowState } = renderWindow({ windowState: state });

    fireEvent.pointerDown(screen.getByText('Espresso'), { clientX: 340, clientY: 240, pointerId: 5 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 300, pointerId: 5 });
    expect(onUpdateWindowState).toHaveBeenCalledWith({ x: 460, y: 260 });

    // Far outside the top-left clamps to the minimum.
    fireEvent.pointerDown(screen.getByText('Espresso'), { clientX: 340, clientY: 240, pointerId: 6 });
    fireEvent.pointerMove(window, { clientX: -500, clientY: -500, pointerId: 6 });
    expect(onUpdateWindowState).toHaveBeenLastCalledWith({ x: 10, y: 65 });

    fireEvent.pointerUp(window);
  });

  it('does not start a drag from inside a button', () => {
    const { onUpdateWindowState } = renderWindow();
    const restore = screen.getByTitle('Toggle maximize');
    fireEvent.pointerDown(restore, { clientX: 100, clientY: 100, pointerId: 7 });
    fireEvent.pointerMove(window, { clientX: 900, clientY: 700, pointerId: 7 });
    expect(onUpdateWindowState).not.toHaveBeenCalled();
  });

  it('resizes from the south-east handle', () => {
    const state = makeWindowState({ width: 480, height: 580, x: 300, y: 200, isPinned: false });
    const { onUpdateWindowState } = renderWindow({ windowState: state });

    const handle = document.querySelector('.cursor-se-resize')!;
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 400, pointerId: 8 });
    fireEvent.pointerMove(window, { clientX: 540, clientY: 430, pointerId: 8 });
    expect(onUpdateWindowState).toHaveBeenCalledWith({ width: 520, height: 610, x: 300, y: 200 });
    fireEvent.pointerUp(window);
  });

  it('resizes west/north handles without shrinking below the minimum', () => {
    const state = makeWindowState({ width: 400, height: 400, x: 300, y: 200, isPinned: false });
    const { onUpdateWindowState } = renderWindow({ windowState: state });

    // West handle: grow leftward.
    const west = document.querySelector('.cursor-w-resize')!;
    fireEvent.pointerDown(west, { clientX: 300, clientY: 300, pointerId: 9 });
    fireEvent.pointerMove(window, { clientX: 280, clientY: 300, pointerId: 9 });
    expect(onUpdateWindowState).toHaveBeenLastCalledWith({ width: 420, height: 400, x: 280, y: 200 });
    fireEvent.pointerUp(window);

    // North handle: attempt to shrink below 280 -> ignored.
    const north = document.querySelector('.cursor-n-resize')!;
    fireEvent.pointerDown(north, { clientX: 300, clientY: 300, pointerId: 10 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 500, pointerId: 10 });
    expect(onUpdateWindowState).toHaveBeenLastCalledWith({ width: 400, height: 400, x: 300, y: 200 });
    fireEvent.pointerUp(window);
  });
});