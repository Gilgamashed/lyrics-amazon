import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyLyricsState } from './EmptyLyricsState';

describe('EmptyLyricsState', () => {
  it('reports a genuine miss as "Lyrics not found" without a Retry', () => {
    render(<EmptyLyricsState outcome="not-found" />);

    expect(screen.getByText('Lyrics not found')).toBeTruthy();
    expect(screen.queryByTestId('retry-lookup')).toBeNull();
  });

  it('never shows a transient failure as "Lyrics not found"', () => {
    render(<EmptyLyricsState outcome="transient-error" />);

    expect(screen.queryByText('Lyrics not found')).toBeNull();
    expect(screen.getByText('Providers are temporarily unavailable')).toBeTruthy();
  });

  it('offers a Retry for a transient failure', () => {
    const onRetry = vi.fn();
    render(<EmptyLyricsState outcome="transient-error" onRetry={onRetry} />);

    expect(screen.getByTestId('retry-lookup')).toBeTruthy();
  });

  it('offers a Retry when every candidate failed the identity gate', () => {
    const onRetry = vi.fn();
    render(<EmptyLyricsState outcome="gate-rejected" onRetry={onRetry} />);

    expect(screen.getByText('Results did not match this track')).toBeTruthy();
    expect(screen.getByTestId('retry-lookup')).toBeTruthy();
  });

  it('does not offer a Retry for a genuine miss even when a handler exists', () => {
    const onRetry = vi.fn();
    render(<EmptyLyricsState outcome="not-found" onRetry={onRetry} />);

    expect(screen.queryByTestId('retry-lookup')).toBeNull();
  });

  it('does not offer a Retry without a handler', () => {
    render(<EmptyLyricsState outcome="transient-error" />);

    expect(screen.queryByTestId('retry-lookup')).toBeNull();
  });

  it('runs the retry handler when the Retry action is used', async () => {
    const onRetry = vi.fn();
    render(<EmptyLyricsState outcome="transient-error" onRetry={onRetry} />);

    await userEvent.click(screen.getByTestId('retry-lookup'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('exposes the outcome for diagnostics', () => {
    render(<EmptyLyricsState outcome="gate-rejected" />);

    expect(screen.getByTestId('empty-lyrics-state').getAttribute('data-outcome')).toBe(
      'gate-rejected'
    );
  });

  it('uses the custom detail only for a genuine miss', () => {
    const { rerender } = render(
      <EmptyLyricsState outcome="not-found" notFoundDetail="Nothing for this track yet." />
    );
    expect(screen.getByText('Nothing for this track yet.')).toBeTruthy();

    rerender(
      <EmptyLyricsState outcome="transient-error" notFoundDetail="Nothing for this track yet." />
    );
    expect(screen.queryByText('Nothing for this track yet.')).toBeNull();
  });
});
