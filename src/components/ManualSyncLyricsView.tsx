import React, { useCallback, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { FontSize } from '../types/lyrics';
import { ManualSyncLine, ManualSyncState } from '../services/manualSync';

interface ManualSyncLyricsViewProps {
  /** Every working line of the session, stamped or not. */
  lines: ManualSyncLine[];
  /** Index of the line the next stamp will land on. */
  pointer: number;
  state: ManualSyncState;
  /** Human-readable session status (`describeManualSync`). */
  status: string;
  fontSize: FontSize;
  /** Center the highlighted line on every pointer change. */
  autoScroll: boolean;
}

/** `m:ss.d` stamp for a stamped line. */
function formatStamp(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

/**
 * The Manual Sync surface (spec 20, W2; corrected in v0.5.7-rc.3).
 *
 * Replaces the normal lyric viewers while a sync session runs: it lists the
 * session's own lines and marks the one the next keypress will stamp. That row
 * always carries a muted "next" cue; the full active glow appears only once at
 * least one line has been stamped, so a fresh session never looks like its
 * first line is already claimed. It deliberately carries no search box, no copy
 * action and no click-to-seek - the only input is the keyboard.
 */
export const ManualSyncLyricsView: React.FC<ManualSyncLyricsViewProps> = ({
  lines,
  pointer,
  state,
  status,
  fontSize,
  autoScroll,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const currentIndex =
    lines.length === 0 ? -1 : Math.min(Math.max(pointer, 0), lines.length - 1);

  // Container-local centering (spec 14 §3.3): never `scrollIntoView`, which
  // would walk every scrollable ancestor and push the panel chrome out of view.
  const centerCurrentLine = useCallback(() => {
    const container = containerRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine) return;

    const target =
      activeLine.offsetTop - container.clientHeight / 2 + activeLine.offsetHeight / 2;
    const top = Math.max(0, target);

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top, behavior: 'smooth' });
    } else {
      container.scrollTop = top;
    }
  }, []);

  // Center on mount and after every stamp / step-back, unless the user turned
  // the Auto-Scroll control off.
  useEffect(() => {
    if (!autoScroll) return;
    centerCurrentLine();
  }, [autoScroll, centerCurrentLine, currentIndex]);

  const getFontSizeClasses = () => {
    switch (fontSize) {
      case 'small':
        return {
          active: 'text-xl leading-relaxed font-bold',
          inactive: 'text-base leading-relaxed',
        };
      case 'large':
        return {
          active: 'text-3xl leading-relaxed font-extrabold',
          inactive: 'text-2xl leading-relaxed',
        };
      case 'xlarge':
        return {
          active: 'text-4xl leading-tight font-extrabold tracking-tight',
          inactive: 'text-3xl leading-snug',
        };
      case 'medium':
      default:
        return {
          active: 'text-2xl leading-relaxed font-bold',
          inactive: 'text-lg leading-relaxed',
        };
    }
  };

  const fontClasses = getFontSizeClasses();
  const isPaused = state === 'paused';
  // A fresh session has nothing recorded: the pointer row only gets the muted
  // "next" cue, never the active glow, so it cannot look already claimed
  // (spec 20 correction, v0.5.7-rc.3).
  const hasStamps = lines.some((line) => line.startTimeMs !== null);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="manual-sync-view">
      <div className="shrink-0 border-b border-white/10 bg-cyan-500/5 px-4 py-1.5">
        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="manual-sync-status"
            className={`text-[11px] font-medium ${isPaused ? 'text-amber-200' : 'text-cyan-200'}`}
          >
            {status}
          </span>
          <span className="hidden sm:inline text-[10px] text-slate-500">
            Enter / Space / Down: stamp · Backspace / Up: step back
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          data-testid="manual-sync-scroller"
          className="h-full overflow-y-auto px-6 py-12 space-y-5 custom-scrollbar select-none"
        >
          {lines.length === 0 ? (
            <p className="text-center text-sm text-slate-400">
              No lyric lines to sync.
            </p>
          ) : (
            lines.map((line, index) => {
              const isNext = index === currentIndex;
              const isActive = isNext && hasStamps;
              const isStamped = line.startTimeMs !== null;

              return (
                <div
                  key={line.id}
                  ref={isNext ? activeLineRef : null}
                  data-testid="manual-sync-line"
                  data-next={isNext ? 'true' : undefined}
                  data-active={isActive ? 'true' : undefined}
                  aria-current={isActive ? 'true' : undefined}
                  className={`relative flex items-baseline gap-2 rounded-xl p-2 transition-all duration-300 ${
                    isActive
                      ? 'scale-[1.02] transform bg-cyan-500/10'
                      : isStamped
                        ? 'opacity-45'
                        : 'opacity-90'
                  }`}
                >
                  <span aria-hidden="true" className="w-3 shrink-0 self-center">
                    {isNext && <ChevronRight className="h-3.5 w-3.5 text-cyan-300/80" />}
                  </span>

                  <p
                    className={`flex-1 transition-colors duration-200 ${
                      isActive
                        ? `${fontClasses.active} text-white glow-text font-bold`
                        : isNext
                          ? `${fontClasses.inactive} text-slate-100`
                          : `${fontClasses.inactive} text-slate-300/80`
                    }`}
                  >
                    {line.text}
                  </p>

                  {isNext && (
                    <span
                      data-testid="manual-sync-next"
                      className="shrink-0 rounded-full border border-cyan-400/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-300/80"
                    >
                      Next
                    </span>
                  )}

                  {isStamped && (
                    <span
                      data-testid="manual-sync-stamp"
                      className={`shrink-0 font-mono text-[10px] tabular-nums ${
                        isActive ? 'text-cyan-200' : 'text-slate-500'
                      }`}
                    >
                      {formatStamp(line.startTimeMs ?? 0)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
