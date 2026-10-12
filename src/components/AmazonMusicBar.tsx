import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Search,
  Radio,
  Sliders,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Volume2,
  Globe,
  Monitor
} from 'lucide-react';
import { Song, AIConfig, DetectionSource } from '../types/lyrics';
import { searchTracks } from '../services/lyricsService';
import { CURATED_TRACKS } from '../services/curatedTracks';
import { OptionsMenu } from './OptionsMenu';

interface AmazonMusicBarProps {
  currentSong: Song;
  isPlaying: boolean;
  currentTimeMs: number;
  syncOffsetMs: number;
  isMediaSessionActive: boolean;
  detectionSource: DetectionSource;
  aiConfig: AIConfig;
  isBusy?: boolean;
  onTogglePlay: () => void;
  onSeek: (timeMs: number) => void;
  onOffsetChange: (offsetMs: number) => void;
  onSelectSong: (song: Song) => void;
  onToggleMediaSession: () => void;
  onSaveAIConfig: (config: AIConfig) => void;
}

export const AmazonMusicBar: React.FC<AmazonMusicBarProps> = ({
  currentSong,
  isPlaying,
  currentTimeMs,
  syncOffsetMs,
  isMediaSessionActive,
  detectionSource,
  aiConfig,
  isBusy,
  onTogglePlay,
  onSeek,
  onOffsetChange,
  onSelectSong,
  onToggleMediaSession,
  onSaveAIConfig,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showOffsetControls, setShowOffsetControls] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await searchTracks(searchQuery);
      setSearchResults(results);
      setShowSearchDropdown(true);
    } catch {
      // Fallback
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.trim().length > 1) {
      setIsSearching(true);
      const results = await searchTracks(query);
      setSearchResults(results);
      setShowSearchDropdown(true);
      setIsSearching(false);
    } else {
      setShowSearchDropdown(false);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = Math.min(100, Math.max(0, (currentTimeMs / currentSong.durationMs) * 100));

  return (
    <header className="w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sticky top-0 z-30 select-none">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Amazon Music Companion Brand & Live Track Lockup */}
        <div className="flex items-center gap-3.5 w-full md:w-auto">
          {/* Amazon Music Logo badge icon */}
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 shadow-md shadow-cyan-500/20 text-white shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>

          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
                Amazon Music
              </span>
              <span className="text-[11px] font-medium text-cyan-400 bg-cyan-950/80 border border-cyan-800/60 px-1.5 py-0.2 rounded text-center">
                HUD SYNC
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {currentSong.title} <span className="text-slate-600">·</span> {currentSong.artist}
            </p>
          </div>

          {/* Media Session Auto-Detect Toggle */}
          <button
            onClick={onToggleMediaSession}
            title={
              isMediaSessionActive
                ? 'Media Session detection active (listening for Amazon Music audio tab)'
                : 'Click to enable auto-sync via Media Session'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all shrink-0 ${
              isMediaSessionActive
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isMediaSessionActive ? 'text-cyan-400' : ''}`} />
            <span className="hidden sm:inline">
              {isMediaSessionActive ? 'Auto-Detect On' : 'Auto-Detect'}
            </span>
          </button>

          {/* Detection source indicator: native desktop bridge vs browser Media Session */}
          <span
            title={
              detectionSource === 'desktop'
                ? 'Detecting playback from the native desktop bridge (Amazon Music app)'
                : 'Detecting playback from browser Media Session — native bridge offline'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-all shrink-0 ${
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
            <span className="hidden md:inline">
              {detectionSource === 'desktop' ? 'Desktop (native)' : 'Browser (Media Session)'}
            </span>
          </span>
        </div>

        {/* Center: Search & Quick Track Switcher */}
        <div className="flex-1 max-w-lg w-full relative" ref={searchContainerRef}>
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchInputChange}
              onFocus={() => {
                if (searchResults.length > 0 || searchQuery.length > 0) {
                  setShowSearchDropdown(true);
                }
              }}
              placeholder="Search Amazon Music track or paste title (e.g. Espresso)..."
              className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/40 transition-all"
            />
            {isSearching ? (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchDropdown(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            ) : null}
          </form>

          {/* Autocomplete / Search Results dropdown */}
          {showSearchDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto custom-scrollbar">
              <div className="p-2 border-b border-slate-800 text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Matching Tracks</span>
                <span className="text-[10px] text-cyan-400">Genius & Synced lyrics available</span>
              </div>
              {searchResults.length > 0 ? (
                searchResults.map((song) => (
                  <button
                    key={song.id}
                    onClick={() => {
                      onSelectSong(song);
                      setShowSearchDropdown(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-800/80 transition-colors border-b border-slate-800/40 last:border-0"
                  >
                    <img
                      src={song.albumArt}
                      alt={song.title}
                      className="w-8 h-8 rounded-lg object-cover bg-slate-800 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-100 truncate">{song.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {formatTime(song.durationMs)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  No matching tracks. Press enter to search Amazon Music catalog.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Playback Controls & Sync Calibration */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* Play/Pause Button */}
          <button
            onClick={onTogglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all shadow-md shadow-cyan-500/25 active:scale-95 shrink-0"
            title={isPlaying ? 'Pause playback' : 'Play & sync lyrics'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          {/* Time Scrubber */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 tabular-nums w-9 text-right">
              {formatTime(currentTimeMs)}
            </span>
            <input
              type="range"
              min={0}
              max={currentSong.durationMs}
              value={currentTimeMs}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="w-24 sm:w-32 accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-[11px] font-mono text-slate-500 tabular-nums w-9">
              {formatTime(currentSong.durationMs)}
            </span>
          </div>

          {/* Sync Calibration Offset Toggle Button */}
          <div className="relative">
            <button
              onClick={() => setShowOffsetControls(!showOffsetControls)}
              title="Calibrate lyric sync offset (speed up or delay lyrics to match your Amazon Music playback)"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-all border ${
                syncOffsetMs !== 0
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="font-mono text-[11px] tabular-nums">
                {syncOffsetMs === 0
                  ? 'Sync'
                  : `${syncOffsetMs > 0 ? '+' : ''}${(syncOffsetMs / 1000).toFixed(1)}s`}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Micro-Adjustment Popup */}
            {showOffsetControls && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <span className="text-xs font-semibold text-slate-200">Lyrics Timing Calibration</span>
                  <button
                    onClick={() => onOffsetChange(0)}
                    className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                  Amazon Music stream slightly ahead or behind? Fine-tune the lyric highlight offset:
                </p>
                <div className="grid grid-cols-4 gap-1 mb-2">
                  <button
                    onClick={() => onOffsetChange(syncOffsetMs - 500)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 font-mono"
                  >
                    -0.5s
                  </button>
                  <button
                    onClick={() => onOffsetChange(syncOffsetMs - 100)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 font-mono"
                  >
                    -0.1s
                  </button>
                  <button
                    onClick={() => onOffsetChange(syncOffsetMs + 100)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 font-mono"
                  >
                    +0.1s
                  </button>
                  <button
                    onClick={() => onOffsetChange(syncOffsetMs + 500)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 font-mono"
                  >
                    +0.5s
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 text-center font-mono">
                  Current Offset: {syncOffsetMs > 0 ? '+' : ''}{(syncOffsetMs / 1000).toFixed(2)}s
                </div>
              </div>
            )}
          </div>

          {/* AI Fallback Options */}
          <OptionsMenu aiConfig={aiConfig} isBusy={isBusy} onSave={onSaveAIConfig} />
        </div>
      </div>

      {/* Quick Picks / Amazon Music Trending Bar */}
      <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-slate-800/60 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0.5">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-cyan-400" /> Amazon Music Trending:
        </span>
        {CURATED_TRACKS.map((track) => {
          const isSelected = track.id === currentSong.id;
          return (
            <button
              key={track.id}
              onClick={() => onSelectSong(track)}
              className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm shadow-cyan-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/50'
              }`}
            >
              <span>{track.title}</span>
              <span className={`text-[10px] ${isSelected ? 'text-slate-900/70' : 'text-slate-500'}`}>
                {track.artist}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
