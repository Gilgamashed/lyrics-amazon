import React from 'react';
import { LyricsData } from '../types/lyrics';
import { X, CheckCircle, ThumbsUp, Info, Disc3 } from 'lucide-react';

interface InfoPanelProps {
  lyricsData: LyricsData;
  activeAnnotationId: string | null;
  onClose: () => void;
  onSelectAnnotation: (id: string | null) => void;
}

/**
 * "Info" panel (formerly the "Genius" drawer). Surfaces artist/song/album
 * details plus any annotations and trivia the lyrics provider supplied. Makes
 * no claim of live artist metadata and fabricates nothing: when the provider
 * has no extra content it renders a clean empty state.
 */
export const InfoPanel: React.FC<InfoPanelProps> = ({
  lyricsData,
  activeAnnotationId,
  onClose,
  onSelectAnnotation,
}) => {
  const selected = lyricsData.annotations.find((ann) => ann.id === activeAnnotationId);
  const trackInfo = lyricsData.trackInfo;
  const hasDetails = Boolean(
      lyricsData.album ||
      lyricsData.artist ||
      trackInfo?.releaseDate ||
      (trackInfo?.writers && trackInfo.writers.length > 0) ||
      (trackInfo?.producers && trackInfo.producers.length > 0)
  );
  const hasAnnotations = lyricsData.annotations.length > 0;
  const hasTrivia = Boolean(lyricsData.trivia && lyricsData.trivia.length > 0);
  const hasAnyContent = hasDetails || hasAnnotations || hasTrivia;

  return (
    <div className="w-80 h-full shrink-0 flex flex-col border-l border-white/10 bg-slate-950/85 backdrop-blur-xl">
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-cyan-400" /> Info
        </span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-slate-200">
        {!hasAnyContent && (
          <div className="flex flex-col items-center justify-center text-center text-slate-500 py-12">
            <Disc3 className="w-8 h-8 mb-3 text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">No additional info</p>
            <p className="text-xs mt-1">
              The lyrics provider did not supply artist, album, annotation or trivia details for this
              track.
            </p>
          </div>
        )}

        {hasDetails && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Song &amp; Album
            </h3>
            <dl className="space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="text-slate-500 w-20 shrink-0">Title</dt>
                <dd className="text-slate-200">{lyricsData.title}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500 w-20 shrink-0">Artist</dt>
                <dd className="text-slate-200">{lyricsData.artist}</dd>
              </div>
              {lyricsData.album && (
                <div className="flex gap-2">
                  <dt className="text-slate-500 w-20 shrink-0">Album</dt>
                  <dd className="text-slate-200">{lyricsData.album}</dd>
                </div>
              )}
              {trackInfo?.releaseDate && (
                <div className="flex gap-2">
                  <dt className="text-slate-500 w-20 shrink-0">Released</dt>
                  <dd className="text-slate-200">{trackInfo.releaseDate}</dd>
                </div>
              )}
              {trackInfo?.writers && trackInfo.writers.length > 0 && (
                <div className="flex gap-2">
                  <dt className="text-slate-500 w-20 shrink-0">Writers</dt>
                  <dd className="text-slate-200">{trackInfo.writers.join(', ')}</dd>
                </div>
              )}
              {trackInfo?.producers && trackInfo.producers.length > 0 && (
                <div className="flex gap-2">
                  <dt className="text-slate-500 w-20 shrink-0">Producers</dt>
                  <dd className="text-slate-200">{trackInfo.producers.join(', ')}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {selected && (
          <section className="bg-slate-900/70 border border-slate-700/70 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1">
                <Info className="w-3 h-3" /> Annotation
              </span>
              {selected.votes !== undefined && (
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" /> {selected.votes}
                </span>
              )}
            </div>
            <p className="text-xs italic text-slate-300 border-l-2 border-cyan-500/60 pl-2 mb-1.5">
              &ldquo;{selected.lineRef}&rdquo;
            </p>
            <h4 className="text-sm font-bold text-white mb-1">{selected.header}</h4>
            <p className="text-xs text-slate-300 leading-relaxed">{selected.content}</p>
            {selected.verifiedBy && (
              <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-cyan-400" />
                  {selected.verifiedBy}
                </span>
                <button
                  onClick={() => onSelectAnnotation(null)}
                  className="text-slate-400 hover:text-white underline text-[10px]"
                >
                  View All
                </button>
              </div>
            )}
          </section>
        )}

        {hasAnnotations && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Annotations ({lyricsData.annotations.length})
            </h3>
            <div className="space-y-2">
              {lyricsData.annotations.map((ann) => {
                const isSelected = ann.id === activeAnnotationId;
                return (
                  <button
                    key={ann.id}
                    type="button"
                    onClick={() => onSelectAnnotation(ann.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/50'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                    }`}
                  >
                    <p className="text-[11px] text-slate-400 truncate mb-0.5">
                      &ldquo;{ann.lineRef}&rdquo;
                    </p>
                    <p className="text-xs font-semibold text-slate-100">{ann.header}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {hasTrivia && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Trivia
            </h3>
            <ul className="space-y-2">
              {lyricsData.trivia.map((item, index) => (
                <li key={index} className="text-xs text-slate-300 leading-relaxed">
                  <span className="text-slate-500 mr-1">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {selected && (
          <button
            type="button"
            onClick={() => onSelectAnnotation(null)}
            className="text-[11px] text-slate-400 hover:text-white underline flex items-center gap-1"
          >
            <CheckCircle className="w-3 h-3" /> View all info
          </button>
        )}
      </div>
    </div>
  );
};
