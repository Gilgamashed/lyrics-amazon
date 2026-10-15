import React from 'react';
import { LyricsData, WindowState, FeedbackState } from '../types/lyrics';
import { KaraokeLyricsView } from './KaraokeLyricsView';
import { FullSheetLyricsView } from './FullSheetLyricsView';
import { InfoPanel } from './InfoPanel';
import { Info, ThumbsUp, ThumbsDown } from 'lucide-react';

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

  return (
    <div
      className={`relative flex flex-col rounded-2xl border border-white/15 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${themeClass}`}
      style={{
        width: `min(${layoutWidth}px, 100%)`,
        maxWidth: '100%',
        opacity: windowState.opacity,
        backdropFilter: `blur(${windowState.blur}px)`,
      }}
    >
      {/* ─── Panel Header: view toggle, Info, sync calibration ─────────── */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/10 shrink-0 bg-black/20">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-xs font-bold text-white truncate tracking-tight">
            {lyricsData.title}
          </span>
          <span className="text-[11px] text-slate-400 truncate">· {lyricsData.artist}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => onUpdateWindowState({ viewMode: 'karaoke' })}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                windowState.viewMode === 'karaoke'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Karaoke (Synced)
            </button>
            <button
              type="button"
              onClick={() => onUpdateWindowState({ viewMode: 'sheet' })}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                windowState.viewMode === 'sheet'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Full Sheet
            </button>
          </div>

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

      {/* ─── Body: lyrics + Info drawer ─────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative" style={{ minHeight: 360 }}>
        <div className="flex-1 h-full overflow-hidden">
          {windowState.viewMode === 'karaoke' ? (
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
              disabled={!onThumbsUp || isLoadingLyrics}
              title="This lyrics result is correct - save it"
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
              disabled={!onThumbsDown || isLoadingLyrics}
              title="Not right - try the next provider"
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
