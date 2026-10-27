import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LyricLine, GeniusAnnotation, FontSize } from '../types/lyrics';
import { Sparkles, MessageSquare, Music2, ArrowDown } from 'lucide-react';
import { EmptyLyricsState } from './EmptyLyricsState';
import { LookupOutcome } from '../services/lookupOutcome';

interface KaraokeLyricsViewProps {
  lyrics: LyricLine[];
  currentTimeMs: number;
  syncOffsetMs: number;
  fontSize: FontSize;
  autoScroll: boolean;
  onSeek: (timeMs: number) => void;
  onSelectAnnotation: (annotationId: string) => void;
  annotations: GeniusAnnotation[];
  isLoading?: boolean;
  /** How the lookup ended (spec 17, W3). */
  lookupOutcome?: LookupOutcome;
  /** Re-runs the lookup after a transient failure. */
  onRetryLookup?: () => void;
}

export const KaraokeLyricsView: React.FC<KaraokeLyricsViewProps> = ({
  lyrics,
  currentTimeMs,
  syncOffsetMs,
  fontSize,
  autoScroll,
  onSeek,
  onSelectAnnotation,
  annotations,
  isLoading = false,
  lookupOutcome,
  onRetryLookup,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  // The scrollTop we last asked the container to move to, and the scrollTop at
  // the previous scroll event: together they let our own (smooth) animation be
  // told apart from the user moving the view.
  const programmaticTargetRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  // Set when the user scrolls away from the active line, which pauses the
  // follow until they scroll it back into view (or press "Follow").
  const [userOverride, setUserOverride] = useState(false);
  const userOverrideRef = useRef(false);

  const applyOverride = useCallback((value: boolean) => {
    if (userOverrideRef.current === value) return;
    userOverrideRef.current = value;
    setUserOverride(value);
  }, []);

  const effectiveTimeMs = currentTimeMs + syncOffsetMs;

  // Find the index of the currently playing line
  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].startTimeMs <= effectiveTimeMs) {
      activeIndex = i;
    } else {
      break;
    }
  }

  // Smoothly center the active line in the view's OWN container via scrollTop
  // math. This never calls `scrollIntoView`, which scrolls every scrollable
  // ancestor and would push the panel header/footer out of view.
  const centerActiveLine = useCallback(() => {
    const container = containerRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine) return;

    const target =
      activeLine.offsetTop - container.clientHeight / 2 + activeLine.offsetHeight / 2;
    const top = Math.max(0, target);

    programmaticTargetRef.current = top;
    lastScrollTopRef.current = container.scrollTop;

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top, behavior: 'smooth' });
    } else {
      container.scrollTop = top;
    }
  }, []);

  // Follow playback automatically unless the user has taken over the scroll.
  useEffect(() => {
    if (!autoScroll || userOverride) return;
    centerActiveLine();
  }, [activeIndex, autoScroll, userOverride, centerActiveLine]);

  // Watch the container's own scroll events. A scroll that does not converge on
  // the line we are centering means the user moved the view: pause the follow,
  // then re-engage it as soon as the active line is back in the visible band.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      const position = container.scrollTop;
      const previous = lastScrollTopRef.current;
      lastScrollTopRef.current = position;

      const activeLine = activeLineRef.current;
      const band = container.clientHeight * 0.1;
      const viewTop = position;
      const viewBottom = position + container.clientHeight;
      const lineTop = activeLine ? activeLine.offsetTop : 0;
      const lineBottom = lineTop + (activeLine ? activeLine.offsetHeight : 0);
      const activeVisible =
        Boolean(activeLine) && lineBottom > viewTop + band && lineTop < viewBottom - band;

      if (userOverrideRef.current) {
        if (activeVisible) applyOverride(false);
        return;
      }

      const target = programmaticTargetRef.current;
      const headingToTarget =
        target !== null && Math.abs(position - target) < Math.abs(previous - target);

      // Our own animation, or the active line is still on screen: nothing to do.
      if (headingToTarget || activeVisible) return;

      applyOverride(true);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [applyOverride, lyrics]);

  // A new track and any change to the Auto-Scroll control re-engage the follow.
  useEffect(() => {
    applyOverride(false);
  }, [applyOverride, lyrics, autoScroll]);

  // Font size mapping
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

  if (!lyrics || lyrics.length === 0) {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center select-none">
          <Sparkles className="w-8 h-8 text-cyan-400 mb-3 animate-spin" />
          <p className="text-sm font-medium text-slate-200">Retrieving synchronized lyrics...</p>
          <p className="text-xs text-slate-500 mt-1">Searching LRCLIB, Lyrica, Genius and other providers</p>
        </div>
      );
    }

    return (
      <EmptyLyricsState
        outcome={lookupOutcome}
        onRetry={onRetryLookup}
        notFoundDetail="No synchronized lyrics were found across any provider for this track."
      />
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={containerRef}
        data-testid="karaoke-scroller"
        className="h-full overflow-y-auto px-6 py-12 space-y-5 custom-scrollbar select-none"
      >
        {lyrics.map((line, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          const isUpcoming = index > activeIndex;

          // Check if there is an annotation
          const hasAnnotation = Boolean(line.annotationId);
          const annotation = hasAnnotation
            ? annotations.find((a) => a.id === line.annotationId)
            : null;

          return (
            <div
              key={line.id}
              ref={isActive ? activeLineRef : null}
              onClick={() => onSeek(line.startTimeMs)}
              className={`group relative transition-all duration-300 rounded-xl p-2 cursor-pointer flex items-baseline justify-between gap-3 ${
                isActive
                  ? 'scale-[1.02] transform'
                  : 'hover:bg-white/5 opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex-1">
                {/* Optional Section indicator */}
                {line.section && line.section !== 'verse' && (
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400/80 mb-0.5">
                    {line.section}
                  </span>
                )}

                <p
                  className={`transition-colors duration-200 ${
                    isActive
                      ? `${fontClasses.active} text-white glow-text font-bold`
                      : isPast
                      ? `${fontClasses.inactive} text-slate-400/50 hover:text-slate-300`
                      : `${fontClasses.inactive} text-slate-300/80 hover:text-slate-100`
                  }`}
                >
                  {line.text}
                </p>
              </div>

              {/* Info Annotation Flag / Button */}
              {hasAnnotation && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (line.annotationId) {
                      onSelectAnnotation(line.annotationId);
                    }
                  }}
                  className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 shadow-sm shadow-amber-400/30 animate-bounce'
                      : 'bg-amber-400/20 text-amber-300 hover:bg-amber-400 hover:text-slate-950 border border-amber-400/30'
                  }`}
                  title="View verified info annotation"
                >
                  <MessageSquare className="w-3 h-3 fill-current" />
                  <span className="hidden sm:inline">Info</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {autoScroll && userOverride && (
        <button
          type="button"
          onClick={() => applyOverride(false)}
          data-testid="follow-active-line"
          title="Resume auto-scroll and center the current line"
          className="absolute bottom-3 right-4 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-cyan-500 text-slate-950 shadow-lg shadow-black/40 hover:bg-cyan-400 transition-colors"
        >
          <ArrowDown className="w-3 h-3" />
          Follow
        </button>
      )}
    </div>
  );
};
