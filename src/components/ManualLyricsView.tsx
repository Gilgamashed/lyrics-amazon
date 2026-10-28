import React from 'react';
import { LyricLine, FontSize } from '../types/lyrics';
import { KaraokeLyricsView } from './KaraokeLyricsView';
import { FullSheetLyricsView } from './FullSheetLyricsView';
import { LookupOutcome } from '../services/lookupOutcome';

interface ManualLyricsViewProps {
  /** The stamped manual lines (empty while the manual text is unsynced). */
  lyrics: LyricLine[];
  /** The manual text (always shown when there are no stamps). */
  plainLyrics: string;
  songTitle: string;
  artist: string;
  fontSize: FontSize;
  autoScroll: boolean;
  currentTimeMs: number;
  syncOffsetMs: number;
  onSeek: (timeMs: number) => void;
  isLoading?: boolean;
  lookupOutcome?: LookupOutcome;
  onRetryLookup?: () => void;
  /** Status line of the running sync session (spec 19, W3). */
  syncStatus?: string;
}

/**
 * The `Manual (Synced)` view (spec 19, W2).
 *
 * It shows the user's own lyrics: with timestamps they render exactly like
 * provider-synced lyrics (active line highlight + auto-follow), without
 * timestamps they render as a static sheet.
 */
export const ManualLyricsView: React.FC<ManualLyricsViewProps> = ({
  lyrics,
  plainLyrics,
  songTitle,
  artist,
  fontSize,
  autoScroll,
  currentTimeMs,
  syncOffsetMs,
  onSeek,
  isLoading = false,
  lookupOutcome,
  onRetryLookup,
  syncStatus,
}) => {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {syncStatus && (
        <div
          data-testid="manual-sync-status"
          className="shrink-0 border-b border-white/10 bg-cyan-500/5 px-4 py-1.5 text-[11px] font-medium text-cyan-200"
        >
          {syncStatus}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {lyrics.length > 0 ? (
          <KaraokeLyricsView
            lyrics={lyrics}
            currentTimeMs={currentTimeMs}
            syncOffsetMs={syncOffsetMs}
            fontSize={fontSize}
            autoScroll={autoScroll}
            onSeek={onSeek}
            onSelectAnnotation={() => {}}
            annotations={[]}
            isLoading={isLoading}
            lookupOutcome={lookupOutcome}
            onRetryLookup={onRetryLookup}
          />
        ) : (
          <FullSheetLyricsView
            lyrics={lyrics}
            plainLyrics={plainLyrics}
            songTitle={songTitle}
            artist={artist}
            fontSize={fontSize}
            onSeek={onSeek}
            isLoading={isLoading}
            lookupOutcome={lookupOutcome}
            onRetryLookup={onRetryLookup}
          />
        )}
      </div>
    </div>
  );
};
