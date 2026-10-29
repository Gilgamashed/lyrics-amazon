import React from 'react';
import { LyricsData, WindowState, FeedbackState, KaraokeAIStatus } from '../types/lyrics';
import { KaraokeLyricsView } from './KaraokeLyricsView';
import { FullSheetLyricsView } from './FullSheetLyricsView';
import { ManualLyricsView } from './ManualLyricsView';
import { ManualSyncLyricsView } from './ManualSyncLyricsView';
import { ManualLyricsEditor } from './ManualLyricsEditor';
import { ManualSyncSession, describeManualSync } from '../services/manualSync';
import { InfoPanel } from './InfoPanel';
import {
  Info,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Trash2,
  RefreshCw,
  Timer,
} from 'lucide-react';
import { LookupOutcome } from '../services/lookupOutcome';

interface LyricsPanelProps {
  lyricsData: LyricsData;
  currentTimeMs: number;
  syncOffsetMs: number;
  onOffsetChange: (offsetMs: number) => void;
  windowState: WindowState;
  onUpdateWindowState: (updates: Partial<WindowState>) => void;
  onSeek: (timeMs: number) => void;
  isLoadingLyrics?: boolean;
  feedbackState?: FeedbackState;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  onGenerateKaraoke?: () => void;
  onCancelKaraoke?: () => void;
  karaokeAIStatus?: KaraokeAIStatus;
  karaokeAIMessage?: string;
  karaokeAIConfigured?: boolean;
  /** How the last lookup ended (spec 17, W3). */
  lookupOutcome?: LookupOutcome;
  /** Re-runs the lookup after a transient failure. */
  onRetryLookup?: () => void;
  /** A saved manual entry exists for this song (spec 19, W2). */
  hasManualLyrics?: boolean;
  /** The saved manual entry itself (shown by the `Manual (Synced)` view). */
  manualEntry?: LyricsData | null;
  /** The manual lyrics editor is open. */
  isEditing?: boolean;
  /** The text the editor opens with. */
  editorText?: string;
  onStartEdit?: () => void;
  onSaveEdit?: (text: string) => void;
  onCancelEdit?: () => void;
  /** Removes the saved manual lyrics (confirmed in the app). */
  onDeleteManual?: () => void;
  /** Runs one provider lookup without the manual lyrics. */
  onSkipManual?: () => void;
  /** The running (or just aborted) sync session (spec 19 W3, spec 20 W3). */
  syncSession?: ManualSyncSession | null;
  onStartSync?: () => void;
  onCancelSync?: () => void;
  onSaveSync?: () => void;
  layoutWidth: number;
}

/**
 * The docked lyrics surface (replaces the former floating, draggable window).
 * Owns the Karaoke/Full Sheet toggle, the Info drawer, the sync-calibration
 * controls and the feedback footer.
 */
export const LyricsPanel: React.FC<LyricsPanelProps> = ({
  lyricsData,
  currentTimeMs,
  syncOffsetMs,
  onOffsetChange,
  windowState,
  onUpdateWindowState,
  onSeek,
  isLoadingLyrics = false,
  feedbackState = 'none',
  onThumbsUp,
  onThumbsDown,
  onGenerateKaraoke,
  onCancelKaraoke,
  karaokeAIStatus = 'idle',
  karaokeAIMessage,
  karaokeAIConfigured = false,
  lookupOutcome,
  onRetryLookup,
  hasManualLyrics = false,
  manualEntry = null,
  isEditing = false,
  editorText = '',
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteManual,
  onSkipManual,
  syncSession = null,
  onStartSync,
  onCancelSync,
  onSaveSync,
  layoutWidth,
}) => {
  const [showInfo, setShowInfo] = React.useState(false);
  const [showSync, setShowSync] = React.useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = React.useState<string | null>(null);

  const themeClass =
    windowState.theme === 'midnight'
      ? 'bg-slate-950'
      : windowState.theme === 'obsidian'
      ? 'bg-zinc-950'
      : windowState.theme === 'cyan'
      ? 'bg-slate-950/90 border-cyan-500/40'
      : 'bg-slate-900/80';

  const plainLineCount = lyricsData.plainLyrics.split('\n').filter((l) => l.trim()).length;
  const isKaraokeBusy =
    karaokeAIStatus === 'capturing' ||
    karaokeAIStatus === 'aligning' ||
    karaokeAIStatus === 'saving';
  const showKaraokeAction =
    lyricsData.syncedLyrics.length === 0 &&
    plainLineCount > 0 &&
    Boolean(onGenerateKaraoke);
  // Manual lyrics are already the user's own decision: thumbs-up/down would
  // copy them into the accepted store (where Delete could not remove them) and
  // the provider index does not exist for the Manual provider (spec 19).
  const isManualProvider = lyricsData.provider === 'Manual';

  // A session owns the surface, the view toggle and the editor (spec 20, D2).
  const syncActive = syncSession !== null && syncSession.state !== 'aborted';
  const syncStatus = syncSession ? describeManualSync(syncSession) : undefined;

  return (
    <div
      className={`relative h-full min-h-0 flex flex-col rounded-2xl border border-white/15 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${themeClass}`}
      style={{
        width: `min(${layoutWidth}px, 100%)`,
        maxWidth: '100%',
        opacity: windowState.opacity,
        backdropFilter: `blur(${windowState.blur}px)`,
      }}
    >
      {/* ─── Panel Header: view toggle, Info, sync calibration ─────────── */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/10 shrink-0 bg-black/20">
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className="min-w-0 truncate text-xs font-bold text-white tracking-tight">
            {lyricsData.title || 'Unknown title'}
          </span>
          <span className="hidden sm:inline shrink-0 text-[11px] text-slate-400 truncate max-w-[40%]">
            · {lyricsData.artist}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => onUpdateWindowState({ viewMode: 'karaoke' })}
              disabled={syncActive}
              data-testid="view-karaoke"
              className={`px-2 sm:px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                windowState.viewMode === 'karaoke'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Karaoke<span className="hidden sm:inline"> (Synced)</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateWindowState({ viewMode: 'sheet' })}
              disabled={syncActive}
              data-testid="view-sheet"
              className={`px-2 sm:px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                windowState.viewMode === 'sheet'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Full Sheet
            </button>
            {hasManualLyrics && (
              <button
                type="button"
                onClick={() => onUpdateWindowState({ viewMode: 'manual' })}
                disabled={syncActive}
                data-testid="view-manual"
                className={`px-2 sm:px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                  windowState.viewMode === 'manual'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Manual<span className="hidden sm:inline"> (Synced)</span>
              </button>
            )}
          </div>

          {/* Manual lyrics editor entry (spec 19, W2). */}
          <button
            type="button"
            onClick={onStartEdit}
            disabled={!onStartEdit || syncActive}
            data-testid="manual-edit"
            title={
              syncActive
                ? 'Sync in progress - the manual lyrics are locked'
                : hasManualLyrics
                  ? 'Edit the saved manual lyrics'
                  : 'Add the lyrics manually'
            }
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Pencil className="h-3.5 w-3.5" />
            {hasManualLyrics ? 'Edit' : 'Manual'}
          </button>

          {/* Sync calibration */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSync((prev) => !prev)}
              title="Calibrate lyric sync offset (speed up or delay lyrics to match your Amazon Music playback)"
              className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-all border ${
                syncOffsetMs !== 0
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white'
              }`}
            >
              <span className="font-mono text-[11px] tabular-nums">
                {syncOffsetMs === 0
                  ? 'Sync'
                  : `${syncOffsetMs > 0 ? '+' : ''}${(syncOffsetMs / 1000).toFixed(1)}s`}
              </span>
            </button>

            {showSync && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <span className="text-xs font-semibold text-slate-200">
                    Lyrics Timing Calibration
                  </span>
                  <button
                    type="button"
                    onClick={() => onOffsetChange(0)}
                    className="text-[10px] text-cyan-400 hover:underline"
                  >
                    Reset
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[-500, -100, 100, 500].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => onOffsetChange(syncOffsetMs + delta)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 font-mono"
                    >
                      {delta > 0 ? '+' : ''}
                      {(delta / 1000).toFixed(1)}s
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-slate-500 text-center font-mono mt-2">
                  Current Offset: {syncOffsetMs > 0 ? '+' : ''}
                  {(syncOffsetMs / 1000).toFixed(2)}s
                </div>
              </div>
            )}
          </div>

          {/* Info drawer toggle */}
          <button
            type="button"
            onClick={() => setShowInfo((prev) => !prev)}
            aria-pressed={showInfo}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              showInfo
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'bg-white/10 text-amber-300 hover:bg-amber-400/20'
            }`}
            title="Artist, album and lyrics info"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Info</span>
          </button>
        </div>
      </div>

      {/* ─── AI karaoke action (plain-only results) ─────────────────────── */}
      {showKaraokeAction && (
        <div
          className="px-4 py-2 border-b border-white/10 shrink-0 flex items-center justify-between gap-3 flex-wrap bg-cyan-500/5"
          data-testid="karaoke-ai-banner"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-200 truncate">
                {karaokeAIStatus === 'done'
                  ? 'Karaoke generated'
                  : 'No timed lyrics for this track'}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {karaokeAIMessage ??
                  'Generate timed karaoke by aligning the audio with these lyrics.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isKaraokeBusy ? (
              <>
                <span
                  className="flex items-center gap-1.5 text-[11px] text-cyan-300"
                  data-testid="karaoke-ai-progress"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {karaokeAIStatus === 'capturing'
                    ? 'Recording audio\u2026'
                    : karaokeAIStatus === 'aligning'
                    ? 'Aligning\u2026'
                    : 'Saving\u2026'}
                </span>
                {onCancelKaraoke && (
                  <button
                    type="button"
                    onClick={onCancelKaraoke}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border border-white/10 bg-slate-800 text-slate-300 hover:text-white transition-all"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                )}
              </>
            ) : (
              <>
                {karaokeAIStatus === 'error' && (
                  <span className="flex items-center gap-1 text-[11px] text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                )}
                {karaokeAIStatus === 'done' && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={onGenerateKaraoke}
                  disabled={!karaokeAIConfigured || isLoadingLyrics}
                  title={
                    karaokeAIConfigured
                      ? 'Capture the audio and align it with these lyrics'
                      : 'Configure the Karaoke AI endpoint in Options first'
                  }
                  data-testid="generate-karaoke"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {karaokeAIStatus === 'error' ? 'Retry' : 'Generate Karaoke (AI)'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Body: lyrics + Info drawer ─────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        <div className="flex-1 h-full overflow-hidden">
          {isEditing ? (
            <ManualLyricsEditor
              initialText={editorText}
              readOnly={syncActive}
              lockedReason="The manual lyrics are locked while a sync session is running."
              onSave={(text) => onSaveEdit?.(text)}
              onCancel={() => onCancelEdit?.()}
            />
          ) : windowState.viewMode === 'manual' && manualEntry ? (
            syncActive && syncSession ? (
              <ManualSyncLyricsView
                lines={syncSession.lines}
                pointer={syncSession.pointer}
                state={syncSession.state}
                status={describeManualSync(syncSession)}
                fontSize={windowState.fontSize}
                autoScroll={windowState.autoScroll}
              />
            ) : (
              <ManualLyricsView
                lyrics={manualEntry.syncedLyrics}
                plainLyrics={manualEntry.plainLyrics}
                songTitle={manualEntry.title}
                artist={manualEntry.artist}
                fontSize={windowState.fontSize}
                autoScroll={windowState.autoScroll}
                currentTimeMs={currentTimeMs}
                syncOffsetMs={syncOffsetMs}
                onSeek={onSeek}
                isLoading={isLoadingLyrics}
                lookupOutcome={lookupOutcome}
                onRetryLookup={onRetryLookup}
                syncStatus={syncStatus}
              />
            )
          ) : windowState.viewMode === 'karaoke' ? (
            <KaraokeLyricsView
              lyrics={lyricsData.syncedLyrics}
              currentTimeMs={currentTimeMs}
              syncOffsetMs={syncOffsetMs}
              fontSize={windowState.fontSize}
              autoScroll={windowState.autoScroll}
              onSeek={onSeek}
              onSelectAnnotation={(annId) => {
                setActiveAnnotationId(annId);
                setShowInfo(true);
              }}
              annotations={lyricsData.annotations}
              isLoading={isLoadingLyrics}
              lookupOutcome={lookupOutcome}
              onRetryLookup={onRetryLookup}
            />
          ) : (
            <FullSheetLyricsView
              lyrics={lyricsData.syncedLyrics}
              plainLyrics={lyricsData.plainLyrics}
              songTitle={lyricsData.title}
              artist={lyricsData.artist}
              fontSize={windowState.fontSize}
              onSeek={onSeek}
              isLoading={isLoadingLyrics}
              lookupOutcome={lookupOutcome}
              onRetryLookup={onRetryLookup}
            />
          )}
        </div>

        {showInfo && (
          <InfoPanel
            lyricsData={lyricsData}
            activeAnnotationId={activeAnnotationId}
            onClose={() => setShowInfo(false)}
            onSelectAnnotation={setActiveAnnotationId}
          />
        )}
      </div>

      {/* ─── Footer: provider, line count, feedback, auto-scroll ─────────── */}
      <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 bg-black/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-cyan-400">
            Provider: {lyricsData.provider}
          </span>
          {hasManualLyrics && (
            <>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1" role="group" aria-label="Manual lyrics">
                <button
                  type="button"
                  onClick={onDeleteManual}
                  disabled={!onDeleteManual || syncActive}
                  data-testid="manual-delete"
                  title={
                    syncActive
                      ? 'Finish or cancel the sync session before deleting the lyrics'
                      : 'Delete the saved manual lyrics for this song'
                  }
                  className="flex items-center gap-1 rounded-md border border-white/10 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
                <button
                  type="button"
                  onClick={onSkipManual}
                  disabled={!onSkipManual}
                  data-testid="manual-skip"
                  title="Search the providers for this song (the manual lyrics are kept)"
                  className="flex items-center gap-1 rounded-md border border-white/10 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="h-3 w-3" /> Skip
                </button>
              </div>
            </>
          )}
          {(hasManualLyrics || (lyricsData.syncedLyrics.length === 0 && plainLineCount > 0)) && (
            <>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1" role="group" aria-label="Manual sync">
                <button
                  type="button"
                  onClick={onStartSync}
                  disabled={!onStartSync || syncActive}
                  data-testid="manual-sync"
                  title="Sync the lyrics by hand: press Enter (or Space / Down) to set the current line break, Backspace (or Up) to step back to the last break."
                  className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Timer className="h-3 w-3" /> Manual Sync
                </button>
                {syncActive && (
                  <>
                    <button
                      type="button"
                      onClick={onSaveSync}
                      disabled={!onSaveSync}
                      data-testid="manual-sync-save"
                      title="Save the manual timings"
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={onCancelSync}
                      disabled={!onCancelSync}
                      data-testid="manual-sync-cancel"
                      title="Discard the manual timings"
                      className="rounded-md border border-white/10 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <span className="text-slate-600">•</span>
          <span className="text-[11px] text-slate-400">
            {lyricsData.syncedLyrics.length > 0
              ? `${lyricsData.syncedLyrics.length} lines parsed`
              : `${plainLineCount} lines`}
          </span>
          <span className="text-slate-600">•</span>
          <div className="flex items-center gap-1" role="group" aria-label="Lyrics feedback">
            <button
              type="button"
              onClick={onThumbsUp}
              disabled={!onThumbsUp || isLoadingLyrics || isManualProvider}
              title={
                isManualProvider
                  ? 'Manual lyrics are already saved locally'
                  : 'This lyrics result is correct - save it'
              }
              aria-pressed={feedbackState === 'up'}
              data-testid="thumbs-up"
              className={`p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                feedbackState === 'up'
                  ? 'text-emerald-400 bg-emerald-500/15'
                  : 'text-slate-400 hover:text-emerald-400 hover:bg-white/10'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onThumbsDown}
              disabled={!onThumbsDown || isLoadingLyrics || isManualProvider}
              title={
                isManualProvider
                  ? 'Manual lyrics have no provider to advance to - use Skip'
                  : 'Not right - try the next provider'
              }
              aria-pressed={feedbackState === 'down'}
              data-testid="thumbs-down"
              className={`p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                feedbackState === 'down'
                  ? 'text-rose-400 bg-rose-500/15'
                  : 'text-slate-400 hover:text-rose-400 hover:bg-white/10'
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] hover:text-white">
          <input
            type="checkbox"
            checked={windowState.autoScroll}
            onChange={(e) => onUpdateWindowState({ autoScroll: e.target.checked })}
            className="accent-cyan-400 rounded w-3.5 h-3.5"
          />
          <span>Auto-Scroll</span>
        </label>
      </div>
    </div>
  );
};
