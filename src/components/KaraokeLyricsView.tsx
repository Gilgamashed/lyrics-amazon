import React, { useEffect, useRef } from 'react';
import { LyricLine, GeniusAnnotation, FontSize } from '../types/lyrics';
import { Sparkles, MessageSquare, Music2 } from 'lucide-react';

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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

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

  // Smooth auto-scroll to keep the active line centered. This scrolls the
  // view's OWN container via scrollTop math and never calls `scrollIntoView`,
  // so no ancestor (the <main> shell or the panel) is ever moved and the
  // panel header/footer stay pinned.
  useEffect(() => {
    const container = containerRef.current;
    const activeLine = activeLineRef.current;
    if (!autoScroll || !container || !activeLine) return;

    const target =
      activeLine.offsetTop - container.clientHeight / 2 + activeLine.offsetHeight / 2;
    const top = Math.max(0, target);

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top, behavior: 'smooth' });
    } else {
      container.scrollTop = top;
    }
  }, [activeIndex, autoScroll]);

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
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center select-none">
        <Music2 className="w-8 h-8 text-slate-500 mb-3" />
        <p className="text-sm font-semibold text-slate-200">Lyrics not found</p>
        <p className="text-xs text-slate-500 mt-1">
          No synchronized lyrics were found across any provider for this track.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto px-6 py-12 space-y-5 custom-scrollbar select-none"
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
  );
};
