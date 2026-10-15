import React, { useState } from 'react';
import { LyricLine, FontSize } from '../types/lyrics';
import { Copy, Check, Search, Play, Music2, Sparkles } from 'lucide-react';

interface FullSheetLyricsViewProps {
  lyrics: LyricLine[];
  plainLyrics: string;
  songTitle: string;
  artist: string;
  fontSize: FontSize;
  onSeek: (timeMs: number) => void;
  isLoading?: boolean;
}

export const FullSheetLyricsView: React.FC<FullSheetLyricsViewProps> = ({
  lyrics,
  plainLyrics,
  songTitle,
  artist,
  fontSize,
  onSeek,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = plainLyrics || lyrics.map((l) => l.text).join('\n');
    navigator.clipboard.writeText(`${songTitle} - ${artist}\n\n${textToCopy}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'small':
        return 'text-sm leading-relaxed';
      case 'large':
        return 'text-lg leading-relaxed';
      case 'xlarge':
        return 'text-xl leading-relaxed';
      case 'medium':
      default:
        return 'text-base leading-relaxed';
    }
  };

  const highlightMatches = (text: string) => {
    if (!searchTerm.trim()) return text;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm.toLowerCase() ? (
        <span key={i} className="bg-cyan-500/30 text-cyan-200 px-0.5 rounded font-semibold">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const hasSynced = lyrics.length > 0;
  const plainLines = plainLyrics
    ? plainLyrics.split('\n').map((t) => t.trim()).filter((t) => t.length > 0)
    : [];
  const hasContent = hasSynced || plainLines.length > 0;

  if (!hasContent) {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center select-none">
          <Sparkles className="w-8 h-8 text-cyan-400 mb-3 animate-spin" />
          <p className="text-sm font-medium text-slate-200">Retrieving lyrics...</p>
          <p className="text-xs text-slate-500 mt-1">Searching Genius, LRCLIB and other providers</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center select-none">
        <Music2 className="w-8 h-8 text-slate-500 mb-3" />
        <p className="text-sm font-semibold text-slate-200">Lyrics not found</p>
        <p className="text-xs text-slate-500 mt-1">
          No lyrics were found across any provider for this track.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col select-text">
      {/* Search & Action bar */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-white/10 shrink-0 bg-black/20">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search within lyrics..."
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/15 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          title="Copy lyrics to clipboard"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy Sheet'}</span>
        </button>
      </div>

      {/* Lyrics lines */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3 custom-scrollbar">
        {hasSynced
          ? lyrics.map((line) => {
              const isMatch = searchTerm && line.text.toLowerCase().includes(searchTerm.toLowerCase());
              return (
                <div
                  key={line.id}
                  onClick={() => onSeek(line.startTimeMs)}
                  className={`group flex items-start justify-between gap-4 py-1 px-2 -mx-2 rounded-lg cursor-pointer transition-colors ${
                    isMatch ? 'bg-cyan-950/40 border border-cyan-800/40' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex-1">
                    {line.section && line.section !== 'verse' && (
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-cyan-400/80 mb-0.5">
                        [{line.section}]
                      </span>
                    )}
                    <p className={`${getFontSizeClass()} text-slate-200 font-normal`}>
                      {highlightMatches(line.text)}
                    </p>
                  </div>

                  <button
                    className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-cyan-400 transition-opacity flex items-center gap-1 pt-1 shrink-0"
                    title="Play from this line"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span className="font-mono text-[10px]">
                      {Math.floor(line.startTimeMs / 60000)}:
                      {String(Math.floor((line.startTimeMs % 60000) / 1000)).padStart(2, '0')}
                    </span>
                  </button>
                </div>
              );
            })
          : plainLines.map((text, idx) => {
              const isMatch = searchTerm && text.toLowerCase().includes(searchTerm.toLowerCase());
              return (
                <div
                  key={`plain-${idx}`}
                  className={`py-1 px-2 -mx-2 rounded-lg transition-colors ${
                    isMatch ? 'bg-cyan-950/40 border border-cyan-800/40' : ''
                  }`}
                >
                  <p className={`${getFontSizeClass()} text-slate-200 font-normal`}>
                    {highlightMatches(text)}
                  </p>
                </div>
              );
            })}
      </div>
    </div>
  );
};
