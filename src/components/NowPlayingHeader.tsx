import React, { useState } from 'react';
import { Song, DetectionSource } from '../types/lyrics';
import { Music2, Monitor, Globe, BarChart3, Loader2, Pencil, RotateCcw } from 'lucide-react';

interface NowPlayingHeaderProps {
  song: Song;
  detectionSource: DetectionSource;
  isLoading?: boolean;
  historyActive: boolean;
  onToggleHistory: () => void;
  optionsMenu?: React.ReactNode;
  /** Detected session app id, surfaced for diagnostics. */
  appId?: string | null;
  /** Opens the metadata-correction dialog and re-runs the provider search. */
  onEditMetadata?: (title: string, artist: string) => void;
  /** True when the current track has a saved manual correction. */
  hasOverride?: boolean;
  /** Reverts to the detected metadata. */
  onRevertOverride?: () => void;
}

/**
 * The now-playing header: the album art is the visual anchor, with the track
 * title/artist/album and the live detection-source indicator. Search, playback
 * controls and the scrubber were removed in the UX redesign.
 */
export const NowPlayingHeader: React.FC<NowPlayingHeaderProps> = ({
  song,
  detectionSource,
  isLoading = false,
  historyActive,
  onToggleHistory,
  optionsMenu,
  appId = null,
  onEditMetadata,
  hasOverride = false,
  onRevertOverride,
}) => {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftArtist, setDraftArtist] = useState('');

  const openEditor = () => {
    setDraftTitle(song.title);
    setDraftArtist(song.artist);
    setEditing(true);
  };

  const canApply = draftTitle.trim().length > 0;

  const apply = () => {
    if (!canApply || !onEditMetadata) return;
    onEditMetadata(draftTitle.trim(), draftArtist.trim());
    setEditing(false);
  };

  const revert = () => {
    onRevertOverride?.();
    setEditing(false);
  };

  const detectionTitle =
    detectionSource === 'desktop'
      ? `Detecting playback from the native desktop bridge (Amazon Music app)${
          appId ? ` · app id: ${appId}` : ''
        }`
      : 'Detecting playback from browser Media Session — native bridge offline';

  return (
    <header className="relative w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-5 py-3 flex items-center gap-4 z-30 shrink-0">
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-slate-700/60 shrink-0 flex items-center justify-center">
        {song.albumArt ? (
          <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <Music2 className="w-6 h-6 text-slate-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-white truncate tracking-tight">{song.title}</h1>
          {isLoading && <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />}
          {detectionSource === 'desktop' && onEditMetadata && (
            <button
              type="button"
              onClick={openEditor}
              title="Fix song or artist name"
              aria-label="Fix song or artist name"
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 shrink-0"
            >
              <Pencil className="w-3 h-3" />
              <span className="hidden sm:inline">Fix</span>
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 truncate">
          {song.artist}
          {song.album ? (
            <>
              <span className="text-slate-600"> · </span>
              {song.album}
            </>
          ) : null}
        </p>
      </div>

      <span
        title={detectionTitle}
        data-testid="detection-chip"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border shrink-0 ${
          detectionSource === 'desktop'
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
            : 'bg-slate-800 text-slate-400 border-slate-700/60'
        }`}
      >
        {detectionSource === 'desktop' ? (
          <Monitor className="w-3.5 h-3.5" />
        ) : (
          <Globe className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">
          {detectionSource === 'desktop' ? 'Desktop (native)' : 'Browser (Media Session)'}
        </span>
      </span>

      <button
        type="button"
        onClick={onToggleHistory}
        aria-pressed={historyActive}
        title="Most Listened"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all shrink-0 ${
          historyActive
            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
            : 'bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white'
        }`}
      >
        <BarChart3 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Most Listened</span>
      </button>

      {optionsMenu}

      {editing && (
        <div
          role="dialog"
          aria-label="Fix song or artist name"
          className="absolute top-full left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-md border-b border-slate-700 shadow-2xl px-5 py-3 flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Song name
            <input
              aria-label="Song name"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white w-56"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Artist
            <input
              aria-label="Artist"
              value={draftArtist}
              onChange={(e) => setDraftArtist(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white w-56"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={!canApply}
              className="px-3 py-1.5 text-xs rounded-lg border bg-cyan-500/15 border-cyan-500/40 text-cyan-200 disabled:opacity-40"
            >
              Search again
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs rounded-lg border bg-slate-800 border-slate-700/60 text-slate-300"
            >
              Cancel
            </button>
            {hasOverride && (
              <button
                type="button"
                onClick={revert}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border bg-slate-800 border-slate-700/60 text-slate-300"
              >
                <RotateCcw className="w-3 h-3" />
                Revert
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
