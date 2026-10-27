import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebugTerminal } from './DebugTerminal';
import { clearDebugEvents, debugLog, getDebugEvents } from '../services/debugConsole';

describe('DebugTerminal', () => {
  beforeEach(() => {
    clearDebugEvents();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('renders nothing while closed', () => {
    render(<DebugTerminal open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('debug-terminal')).toBeNull();
  });

  it('lists the recorded events', () => {
    debugLog('provider', 'lrclib.get', { status: 503 });
    render(<DebugTerminal open onClose={() => {}} />);

    expect(screen.getByTestId('debug-terminal')).toBeInTheDocument();
    expect(screen.getByText('lrclib.get')).toBeInTheDocument();
    expect(screen.getAllByText('provider').length).toBeGreaterThan(0);
  });

  it('shows events recorded after it was opened', () => {
    render(<DebugTerminal open onClose={() => {}} />);
    act(() => {
      debugLog('lookup', 'lookup.start');
    });
    expect(screen.getByText('lookup.start')).toBeInTheDocument();
  });

  it('filters by scope', () => {
    debugLog('provider', 'provider-event');
    debugLog('cache', 'cache-event');
    render(<DebugTerminal open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Filter by scope'), { target: { value: 'cache' } });

    expect(screen.getByText('cache-event')).toBeInTheDocument();
    expect(screen.queryByText('provider-event')).toBeNull();
  });

  it('filters by free text', () => {
    debugLog('provider', 'lrclib.get', { status: 503 });
    debugLog('provider', 'lrclib.search', { status: 200 });
    render(<DebugTerminal open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Filter events'), { target: { value: 'search' } });

    expect(screen.getByText('lrclib.search')).toBeInTheDocument();
    expect(screen.queryByText('lrclib.get')).toBeNull();
  });

  it('shows only the selected level and restores every level when cleared', () => {
    debugLog('provider', 'info-event');
    debugLog('provider', 'warn-event', undefined, 'warn');
    render(<DebugTerminal open onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'warn' }));

    expect(screen.getByText('warn-event')).toBeInTheDocument();
    expect(screen.queryByText('info-event')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'warn' }));

    expect(screen.getByText('info-event')).toBeInTheDocument();
  });

  it('clears the buffer', () => {
    debugLog('app', 'some-event');
    render(<DebugTerminal open onClose={() => {}} />);

    fireEvent.click(screen.getByTitle('Clear events'));

    expect(getDebugEvents()).toHaveLength(0);
    expect(screen.getByText(/No events recorded yet/)).toBeInTheDocument();
  });

  it('closes on request', () => {
    const onClose = vi.fn();
    render(<DebugTerminal open onClose={onClose} />);

    fireEvent.click(screen.getByTitle('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
