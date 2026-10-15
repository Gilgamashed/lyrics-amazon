import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InfoPanel } from './InfoPanel';
import { makeLyrics } from '../test/fixtures';

type Props = Parameters<typeof InfoPanel>[0];

function renderPanel(overrides: Partial<Props> = {}) {
  const onClose = vi.fn();
  const onSelectAnnotation = vi.fn();
  const utils = render(
    <InfoPanel
      lyricsData={makeLyrics()}
      activeAnnotationId={null}
      onClose={onClose}
      onSelectAnnotation={onSelectAnnotation}
      {...overrides}
    />
  );
  return { onClose, onSelectAnnotation, ...utils };
}

describe('InfoPanel', () => {
  it('renders song and album details', () => {
    renderPanel();
    expect(screen.getByText('Song & Album')).toBeInTheDocument();
    expect(screen.getByText('Short n\' Sweet')).toBeInTheDocument();
    expect(screen.getAllByText('Sabrina Carpenter').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Producer X')).toBeInTheDocument();
  });

  it('renders the empty state when there is no extra content', () => {
    renderPanel({
      lyricsData: makeLyrics({
        album: '',
        artist: '',
        trackInfo: undefined,
        annotations: [],
        trivia: [],
      }),
    });
    expect(screen.getByText('No additional info')).toBeInTheDocument();
  });

  it('lists annotations and selects one', () => {
    const { onSelectAnnotation } = renderPanel();
    expect(screen.getByText('Annotations (2)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Lyrical Theme & Concept'));
    expect(onSelectAnnotation).toHaveBeenCalledWith('ann-2');
  });

  it('shows the selected annotation detail with votes and verification', () => {
    renderPanel({ activeAnnotationId: 'ann-2' });
    expect(screen.getByText('Establishes the central conflict.')).toBeInTheDocument();
    expect(screen.getByText('1950')).toBeInTheDocument();
    expect(screen.getByText('Sabrina Carpenter (Verified Artist)')).toBeInTheDocument();
  });

  it('renders trivia and closes back to all annotations', () => {
    const { onSelectAnnotation } = renderPanel({ activeAnnotationId: 'ann-1' });
    expect(screen.getByText('Trivia')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View All'));
    expect(onSelectAnnotation).toHaveBeenCalledWith(null);
  });

  it('closes via the header button', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('hides trivia when absent', () => {
    renderPanel({ lyricsData: makeLyrics({ trivia: [] }) });
    expect(screen.queryByText('Trivia')).not.toBeInTheDocument();
  });
});
