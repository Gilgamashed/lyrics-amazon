import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LyricsPanel } from './LyricsPanel';
import { makeLyrics, makeWindowState } from '../test/fixtures';
import {
  createManualSyncSession,
  startManualSync,
  stampManualSync,
} from '../services/manualSync';

type Props = Parameters<typeof LyricsPanel>[0];

/** A running session over the three-line fixture text. */
function syncSession(stamped = 0) {
  let session = startManualSync(
    createManualSyncSession('First line\nSecond line\nThird line', 'raw-key')
  );
  for (let index = 0; index < stamped; index += 1) {
    session = stampManualSync(session, (index + 1) * 1000);
  }
  return session;
}

function renderPanel(overrides: Partial<Props> = {}) {
  const onOffsetChange = vi.fn();
  const onUpdateWindowState = vi.fn();
  const onSeek = vi.fn();
  const onThumbsUp = vi.fn();
  const onThumbsDown = vi.fn();
  const utils = render(
    <LyricsPanel
      lyricsData={makeLyrics()}
      currentTimeMs={0}
      syncOffsetMs={0}
      onOffsetChange={onOffsetChange}
      windowState={makeWindowState()}
      onUpdateWindowState={onUpdateWindowState}
      onSeek={onSeek}
      onThumbsUp={onThumbsUp}
      onThumbsDown={onThumbsDown}
      layoutWidth={680}
      {...overrides}
    />
  );
  return { onOffsetChange, onUpdateWindowState, onThumbsUp, onThumbsDown, onSeek, ...utils };
}

describe('LyricsPanel', () => {
  it('renders provider and parsed line count', () => {
    renderPanel();
    expect(screen.getByText('Provider: Genius')).toBeInTheDocument();
    expect(screen.getByText('3 lines parsed')).toBeInTheDocument();
  });

  it('toggles the view mode', () => {
    const { onUpdateWindowState } = renderPanel();
    fireEvent.click(screen.getByText('Full Sheet'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ viewMode: 'sheet' });
  });

  it('bounds its own height so the lyric surfaces can scroll', () => {
    const { container } = renderPanel();
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('h-full');
    expect(panel.className).toContain('min-h-0');
    expect(panel.className).toContain('overflow-hidden');
  });

  it('renders the full sheet when the mode is sheet', () => {
    renderPanel({ windowState: makeWindowState({ viewMode: 'sheet' }) });
    expect(screen.getByPlaceholderText('Search within lyrics...')).toBeInTheDocument();
  });

  it('calibrates the sync offset', () => {
    const { onOffsetChange } = renderPanel();
    fireEvent.click(screen.getByTitle(/Calibrate lyric sync offset/));
    fireEvent.click(screen.getByText('+0.5s'));
    expect(onOffsetChange).toHaveBeenCalledWith(500);
    fireEvent.click(screen.getByText('Reset'));
    expect(onOffsetChange).toHaveBeenCalledWith(0);
  });

  it('shows a non-zero offset label', () => {
    renderPanel({ syncOffsetMs: 1200 });
    expect(screen.getByText('+1.2s')).toBeInTheDocument();
  });

  it('opens the Info drawer', () => {
    renderPanel();
    fireEvent.click(screen.getByTitle('Artist, album and lyrics info'));
    expect(screen.getByText('Song & Album')).toBeInTheDocument();
  });

  it('reports feedback via the thumbs buttons', () => {
    const { onThumbsUp, onThumbsDown } = renderPanel();
    fireEvent.click(screen.getByTestId('thumbs-up'));
    fireEvent.click(screen.getByTestId('thumbs-down'));
    expect(onThumbsUp).toHaveBeenCalledOnce();
    expect(onThumbsDown).toHaveBeenCalledOnce();
  });

  it('toggles auto-scroll', () => {
    const { onUpdateWindowState } = renderPanel();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ autoScroll: false });
  });

  const plainOnly = () =>
    makeLyrics({ syncedLyrics: [], plainLyrics: 'Line one\nLine two', provider: 'Genius' });

  it('hides the AI karaoke banner when synced lyrics are present', () => {
    renderPanel({ onGenerateKaraoke: vi.fn() });
    expect(screen.queryByTestId('karaoke-ai-banner')).not.toBeInTheDocument();
  });

  it('shows a disabled Generate Karaoke button until the endpoint is configured', () => {
    renderPanel({ lyricsData: plainOnly(), onGenerateKaraoke: vi.fn() });
    const button = screen.getByTestId('generate-karaoke');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Generate Karaoke (AI)');
  });

  it('invokes generate when configured and clicked', () => {
    const onGenerateKaraoke = vi.fn();
    renderPanel({
      lyricsData: plainOnly(),
      onGenerateKaraoke,
      karaokeAIConfigured: true,
    });
    fireEvent.click(screen.getByTestId('generate-karaoke'));
    expect(onGenerateKaraoke).toHaveBeenCalledOnce();
  });

  it('shows progress and cancels an in-flight generation', () => {
    const onCancelKaraoke = vi.fn();
    renderPanel({
      lyricsData: plainOnly(),
      onGenerateKaraoke: vi.fn(),
      onCancelKaraoke,
      karaokeAIConfigured: true,
      karaokeAIStatus: 'aligning',
    });
    expect(screen.getByTestId('karaoke-ai-progress')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onCancelKaraoke).toHaveBeenCalledOnce();
  });

  it('offers a retry after an error and a saved confirmation', () => {
    const { rerender } = renderPanel({
      lyricsData: plainOnly(),
      onGenerateKaraoke: vi.fn(),
      karaokeAIConfigured: true,
      karaokeAIStatus: 'error',
      karaokeAIMessage: 'Alignment request failed.',
    });
    expect(screen.getByText('Alignment request failed.')).toBeInTheDocument();
    expect(screen.getByTestId('generate-karaoke')).toHaveTextContent('Retry');

    rerender(
      <LyricsPanel
        lyricsData={plainOnly()}
        currentTimeMs={0}
        syncOffsetMs={0}
        onOffsetChange={vi.fn()}
        windowState={makeWindowState()}
        onUpdateWindowState={vi.fn()}
        onSeek={vi.fn()}
        onGenerateKaraoke={vi.fn()}
        karaokeAIConfigured
        karaokeAIStatus="done"
        layoutWidth={680}
      />
    );
    expect(screen.getByText('Karaoke generated')).toBeInTheDocument();
  });
  // ─── Manual lyrics (spec 19, W2) ─────────────────────────────────────
  const manualEntry = () =>
    makeLyrics({
      provider: 'Manual',
      syncedLyrics: [{ id: 'm0', startTimeMs: 1000, text: 'My own line' }],
      plainLyrics: 'My own line',
    });

  it('hides the Manual (Synced) view until a manual entry exists', () => {
    renderPanel();
    expect(screen.queryByTestId('view-manual')).not.toBeInTheDocument();

    renderPanel({ hasManualLyrics: true, manualEntry: manualEntry() });
    expect(screen.getAllByTestId('view-manual').length).toBeGreaterThan(0);
  });

  it('switches to the Manual (Synced) view', () => {
    const { onUpdateWindowState } = renderPanel({
      hasManualLyrics: true,
      manualEntry: manualEntry(),
    });

    fireEvent.click(screen.getByTestId('view-manual'));
    expect(onUpdateWindowState).toHaveBeenCalledWith({ viewMode: 'manual' });
  });

  it('labels the editor action Edit when lyrics exist and Manual otherwise', () => {
    renderPanel();
    expect(screen.getByTestId('manual-edit')).toHaveTextContent('Manual');

    renderPanel({ hasManualLyrics: true, manualEntry: manualEntry() });
    expect(screen.getAllByTestId('manual-edit')[1]).toHaveTextContent('Edit');
  });

  it('opens the editor surface', () => {
    const onStartEdit = vi.fn();
    renderPanel({ hasManualLyrics: true, manualEntry: manualEntry(), onStartEdit });

    fireEvent.click(screen.getAllByTestId('manual-edit')[0]);
    expect(onStartEdit).toHaveBeenCalledOnce();
  });

  it('renders the editor surface instead of the lyrics', () => {
    renderPanel({ isEditing: true, editorText: 'Draft line' });
    expect(screen.getByTestId('manual-editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Manual lyrics')).toHaveValue('Draft line');
  });

  it('locks the editor while a sync session is running', () => {
    renderPanel({ isEditing: true, syncSession: syncSession() });
    expect(screen.getByTestId('manual-editor-locked')).toBeInTheDocument();
    expect(screen.getByTestId('manual-edit')).toBeDisabled();
  });

  it('offers Delete and Skip only when a manual entry exists', () => {
    renderPanel();
    expect(screen.queryByTestId('manual-delete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manual-skip')).not.toBeInTheDocument();

    renderPanel({ hasManualLyrics: true, manualEntry: manualEntry() });
    expect(screen.getAllByTestId('manual-delete').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('manual-skip').length).toBeGreaterThan(0);
  });

  it('triggers the delete and skip actions', () => {
    const onDeleteManual = vi.fn();
    const onSkipManual = vi.fn();
    renderPanel({
      hasManualLyrics: true,
      manualEntry: manualEntry(),
      onDeleteManual,
      onSkipManual,
    });

    fireEvent.click(screen.getAllByTestId('manual-delete')[0]);
    fireEvent.click(screen.getAllByTestId('manual-skip')[0]);
    expect(onDeleteManual).toHaveBeenCalledOnce();
    expect(onSkipManual).toHaveBeenCalledOnce();
  });

  it('disables the thumbs for manual lyrics', () => {
    renderPanel({ lyricsData: makeLyrics({ provider: 'Manual' }) });
    expect(screen.getByTestId('thumbs-up')).toBeDisabled();
    expect(screen.getByTestId('thumbs-down')).toBeDisabled();
  });

  it('offers Manual Sync for a manual entry or a plain-only sheet', () => {
    renderPanel({ lyricsData: plainOnly() });
    expect(screen.getByTestId('manual-sync')).toBeInTheDocument();

    renderPanel({ hasManualLyrics: true, manualEntry: manualEntry() });
    expect(screen.getAllByTestId('manual-sync').length).toBeGreaterThan(0);
  });

  it('offers the sync save and cancel actions while a session runs', () => {
    renderPanel({
      hasManualLyrics: true,
      manualEntry: manualEntry(),
      syncSession: syncSession(),
      onSaveSync: vi.fn(),
      onCancelSync: vi.fn(),
    });

    expect(screen.getAllByTestId('manual-sync-save').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('manual-sync-cancel').length).toBeGreaterThan(0);
  });

  it('renders the sync surface without the lyrics search bar', () => {
    renderPanel({
      windowState: makeWindowState({ viewMode: 'manual' }),
      hasManualLyrics: true,
      manualEntry: manualEntry(),
      syncSession: syncSession(),
    });

    expect(screen.getByTestId('manual-sync-scroller')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search within lyrics...')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy Sheet')).not.toBeInTheDocument();
  });

  it('locks the view toggle and Delete while a session runs', () => {
    renderPanel({
      windowState: makeWindowState({ viewMode: 'manual' }),
      hasManualLyrics: true,
      manualEntry: manualEntry(),
      syncSession: syncSession(),
      onSkipManual: vi.fn(),
    });

    expect(screen.getByTestId('view-karaoke')).toBeDisabled();
    expect(screen.getByTestId('view-sheet')).toBeDisabled();
    expect(screen.getByTestId('view-manual')).toBeDisabled();
    expect(screen.getByTestId('manual-delete')).toBeDisabled();
    // Skip stays available (spec 20, D1).
    expect(screen.getByTestId('manual-skip')).toBeEnabled();
  });

  it('shows the sync status on the sync surface', () => {
    renderPanel({
      windowState: makeWindowState({ viewMode: 'manual' }),
      hasManualLyrics: true,
      manualEntry: manualEntry(),
      syncSession: syncSession(),
    });

    expect(screen.getByTestId('manual-sync-status')).toHaveTextContent('Syncing');
  });

  it('falls back to the Manual view once the session is aborted', () => {
    renderPanel({
      windowState: makeWindowState({ viewMode: 'manual' }),
      hasManualLyrics: true,
      manualEntry: manualEntry(),
      syncSession: { ...syncSession(), state: 'aborted' },
    });

    expect(screen.queryByTestId('manual-sync-scroller')).not.toBeInTheDocument();
    expect(screen.getByTestId('manual-sync-status')).toHaveTextContent('Aborted');
    expect(screen.getByTestId('view-karaoke')).toBeEnabled();
  });
});
