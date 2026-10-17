import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MostListenedPanel } from './MostListenedPanel';
import { recordPlay } from '../services/playHistoryStore';

function renderPanel() {
  const onSelectSong = vi.fn();
  render(<MostListenedPanel onSelectSong={onSelectSong} />);
  return { onSelectSong };
}

describe('MostListenedPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the empty state when there is no history', () => {
    renderPanel();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('lists ranked songs with their play counts', () => {
    const now = Date.now();
    recordPlay({ id: '1', title: 'Song A', artist: 'Artist A', album: '', albumArt: '', durationMs: 0 }, 'amazon', now - 1000);
    recordPlay({ id: '2', title: 'Song B', artist: 'Artist B', album: '', albumArt: '', durationMs: 0 }, 'amazon', now - 900);
    recordPlay({ id: '2', title: 'Song B', artist: 'Artist B', album: '', albumArt: '', durationMs: 0 }, 'amazon', now - 800);

    renderPanel();
    expect(screen.getByText('Song A')).toBeInTheDocument();
    expect(screen.getByText('Song B')).toBeInTheDocument();
    expect(screen.getByText('2×')).toBeInTheDocument();
    expect(screen.getByText('1×')).toBeInTheDocument();
  });

  it('switches ranking periods', () => {
    recordPlay({ id: '1', title: 'Song A', artist: 'Artist A', album: '', albumArt: '', durationMs: 0 }, 'amazon');
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Lifetime' }));
    expect(screen.getByText('All-time play counts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByText('Ranked for the current month')).toBeInTheDocument();
  });

  it('selects a song to display its lyrics', () => {
    recordPlay({ id: '1', title: 'Song A', artist: 'Artist A', album: 'Al', albumArt: '', durationMs: 0 }, 'amazon');
    const { onSelectSong } = renderPanel();

    fireEvent.click(screen.getByText('Song A'));
    expect(onSelectSong).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Song A', artist: 'Artist A', id: expect.stringContaining('history-') })
    );
  });

  it('resets the history from the panel', () => {
    recordPlay({ id: '1', title: 'Song A', artist: 'Artist A', album: '', albumArt: '', durationMs: 0 }, 'amazon');
    renderPanel();
    expect(screen.getByText('Song A')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Reset play history'));
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});
