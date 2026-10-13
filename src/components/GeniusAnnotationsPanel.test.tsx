import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeniusAnnotationsPanel } from './GeniusAnnotationsPanel';
import { makeLyrics } from '../test/fixtures';

function renderPanel(overrides: Partial<Parameters<typeof GeniusAnnotationsPanel>[0]> = {}) {
  const onClose = vi.fn();
  const onSelectAnnotation = vi.fn();
  const data = makeLyrics();
  render(
    <GeniusAnnotationsPanel
      lyricsData={data}
      activeAnnotationId={null}
      onClose={onClose}
      onSelectAnnotation={onSelectAnnotation}
      {...overrides}
    />
  );
  return { onClose, onSelectAnnotation };
}

describe('GeniusAnnotationsPanel', () => {
  it('shows the header and annotation count', () => {
    renderPanel();
    expect(screen.getByText('Genius Insights & Annotations')).toBeInTheDocument();
    expect(screen.getByText('Verified Annotations (2)')).toBeInTheDocument();
  });

  it('closes via the close button', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByTitle('Close panel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('selects an annotation from the list', () => {
    const { onSelectAnnotation } = renderPanel();
    fireEvent.click(screen.getByText('Wordplay & Hidden Meaning'));
    expect(onSelectAnnotation).toHaveBeenCalledWith('ann-1');
  });

  it('spotlights the active annotation with votes, attribution and View All', () => {
    const { onSelectAnnotation } = renderPanel({ activeAnnotationId: 'ann-1' });

    expect(screen.getByText('Line Highlight')).toBeInTheDocument();
    // The spotlit line is echoed in the list below as well.
    expect(screen.getAllByText('"Second lyric line"').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('+3410').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Genius Editorial Team').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('A pivotal metaphor.').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByText('View All'));
    expect(onSelectAnnotation).toHaveBeenCalledWith(null);
  });

  it('renders trivia, writers, producers and release date', () => {
    renderPanel();
    expect(screen.getByText('Behind the Lyrics Trivia')).toBeInTheDocument();
    expect(screen.getByText('Trivia fact one')).toBeInTheDocument();
    expect(screen.getByText('Trivia fact two')).toBeInTheDocument();
    expect(screen.getByText('Sabrina Carpenter')).toBeInTheDocument();
    expect(screen.getByText('Producer X')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('omits trivia and credits when absent', () => {
    const data = makeLyrics({ trivia: [], trackInfo: undefined, annotations: [] });
    renderPanel({ lyricsData: data });
    expect(screen.queryByText('Behind the Lyrics Trivia')).not.toBeInTheDocument();
    expect(screen.queryByText('Writers:')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified Annotations (2)')).not.toBeInTheDocument();
  });
});