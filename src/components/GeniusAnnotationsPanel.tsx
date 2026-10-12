import React from 'react';
import { GeniusAnnotation, LyricsData } from '../types/lyrics';
import { X, CheckCircle, ThumbsUp, Sparkles, BookOpen, ExternalLink } from 'lucide-react';

interface GeniusAnnotationsPanelProps {
  lyricsData: LyricsData;
  activeAnnotationId: string | null;
  onClose: () => void;
  onSelectAnnotation: (id: string | null) => void;
}

export const GeniusAnnotationsPanel: React.FC<GeniusAnnotationsPanelProps> = ({
  lyricsData,
  activeAnnotationId,
  onClose,
  onSelectAnnotation,
}) => {
  const selectedAnnotation = lyricsData.annotations.find((a) => a.id === activeAnnotationId);

  return (
    <div className="h-full flex flex-col bg-slate-950/95 border-l border-white/10 text-slate-100 select-text overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-400 text-slate-950 shrink-0 font-bold">
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="w-4 h-4 fill-slate-950" />
          <span>Genius Insights & Annotations</span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
          title="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Selected Annotation Spotlight if active */}
        {selectedAnnotation && (
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 shadow-lg">
            <div className="flex items-center justify-between text-xs text-amber-300 font-semibold mb-1">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Line Highlight
              </span>
              {selectedAnnotation.votes && (
                <span className="flex items-center gap-1 text-[11px] text-amber-200 font-mono">
                  <ThumbsUp className="w-3 h-3" /> +{selectedAnnotation.votes}
                </span>
              )}
            </div>

            <p className="text-xs italic text-slate-200 border-l-2 border-amber-400 pl-2 my-2 font-medium">
              "{selectedAnnotation.lineRef}"
            </p>

            <h4 className="text-sm font-bold text-white mb-1.5">{selectedAnnotation.header}</h4>
            <p className="text-xs text-slate-300 leading-relaxed">{selectedAnnotation.content}</p>

            {selectedAnnotation.verifiedBy && (
              <div className="mt-3 pt-2 border-t border-amber-500/20 flex items-center justify-between text-[11px] text-amber-400">
                <span className="flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3 h-3 text-amber-400 fill-current" />
                  {selectedAnnotation.verifiedBy}
                </span>
                <button
                  onClick={() => onSelectAnnotation(null)}
                  className="text-slate-400 hover:text-white underline text-[10px]"
                >
                  View All
                </button>
              </div>
            )}
          </div>
        )}

        {/* All Annotations list */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <span>Verified Annotations ({lyricsData.annotations.length})</span>
          </h3>

          <div className="space-y-2">
            {lyricsData.annotations.map((ann) => {
              const isSelected = ann.id === activeAnnotationId;
              return (
                <div
                  key={ann.id}
                  onClick={() => onSelectAnnotation(ann.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-amber-900/30 border-amber-400/80 shadow-md'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                  }`}
                >
                  <p className="text-[11px] text-slate-400 truncate mb-1">"{ann.lineRef}"</p>
                  <p className="text-xs font-semibold text-slate-100">{ann.header}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Track Trivia & Behind the Lyrics */}
        {lyricsData.trivia && lyricsData.trivia.length > 0 && (
          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <span>Behind the Lyrics Trivia</span>
            </h3>
            <ul className="space-y-2">
              {lyricsData.trivia.map((t, i) => (
                <li
                  key={i}
                  className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/80"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Track Credits */}
        {lyricsData.trackInfo && (
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p>
              <strong className="text-slate-300">Writers:</strong>{' '}
              {lyricsData.trackInfo.writers.join(', ')}
            </p>
            <p>
              <strong className="text-slate-300">Producers:</strong>{' '}
              {lyricsData.trackInfo.producers.join(', ')}
            </p>
            <p>
              <strong className="text-slate-300">Released:</strong>{' '}
              {lyricsData.trackInfo.releaseDate}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
