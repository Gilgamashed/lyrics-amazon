import React from 'react';
import { Song } from '../types/lyrics';
import { getRanking, resetHistory, RankingPeriod, RankedSong } from '../services/playHistoryStore';
import { Music2, RotateCcw, Flame } from 'lucide-react';

interface MostListenedPanelProps {
  onSelectSong: (song: Song) => void;
}

const TABS: { id: RankingPeriod; label: string; hint: string }[] = [
  { id: 'hot', label: 'Hot', hint: 'Most played in the last 5 days' },
  { id: 'month', label: 'Month', hint: 'Ranked for the current month' },
  { id: 'lifetime', label: 'Lifetime', hint: 'All-time play counts' },
];

function toSong(entry: RankedSong): Song {
  return {
    id: `history-${entry.key}`,
    title: entry.title,
    artist: entry.artist,
    album: entry.album || 'Amazon Music',
    albumArt: entry.albumArt || '',
    durationMs: 180_000,
  };
}

/**
 * "Most Listened" view: Hot / Month / Lifetime rankings backed by the local
 * play-history store. Selecting a song re-displays its lyrics, replacing the
 * removed search bar.
 */
export const MostListenedPanel: React.FC<MostListenedPanelProps> = ({ onSelectSong }) => {
  const [period, setPeriod] = React.useState<RankingPeriod>('hot');
  const [version, setVersion] = React.useState(0);

  const ranking = React.useMemo(() => getRanking(period), [period, version]);

  const handleReset = () => {
    resetHistory();
    setVersion((prev) => prev + 1);
  };

  const activeTab = TABS.find((tab) => tab.id === period)!;

  return (
    <div className="w-full h-full flex flex-col rounded-2xl border border-white/15 bg-slate-900/80 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 shrink-0">
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              title={tab.hint}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                period === tab.id
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleReset}
          title="Reset play history"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-slate-700/60 bg-slate-800 text-slate-300 hover:text-white transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {ranking.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center select-none">
            <Flame className="w-8 h-8 text-slate-500 mb-3" />
            <p className="text-sm font-semibold text-slate-200">Nothing here yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Songs appear once at least 30 seconds have been played.
            </p>
          </div>
        ) : (
          <ul>
            {ranking.map((entry, index) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => onSelectSong(toSong(entry))}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-800/70 transition-colors border-b border-slate-800/50"
                >
                  <span className="w-5 text-center text-xs font-mono text-slate-500">
                    {index + 1}
                  </span>
                  <span className="w-9 h-9 rounded-lg overflow-hidden bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0">
                    {entry.albumArt ? (
                      <img
                        src={entry.albumArt}
                        alt={entry.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music2 className="w-4 h-4 text-slate-500" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-100 truncate">
                      {entry.title}
                    </span>
                    <span className="block text-[11px] text-slate-400 truncate">{entry.artist}</span>
                  </span>
                  <span className="text-xs text-cyan-300 font-mono tabular-nums shrink-0">
                    {entry.count}×
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/10 text-[11px] text-slate-500 bg-black/20 shrink-0">
        {activeTab.hint}
      </div>
    </div>
  );
};
