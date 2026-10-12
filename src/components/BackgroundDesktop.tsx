import React from 'react';
import { WindowState, WindowPreset, Song } from '../types/lyrics';
import {
  Monitor,
  Maximize,
  Layout,
  Play,
  Volume2,
  ListMusic,
  Share2,
  Heart,
  Shuffle,
  Repeat,
  Radio,
} from 'lucide-react';

interface BackgroundDesktopProps {
  currentSong: Song;
  isPlaying: boolean;
  onApplyPreset: (preset: WindowPreset) => void;
  backgroundTheme: 'amazon-music' | 'studio' | 'minimal';
  onChangeBackgroundTheme: (theme: 'amazon-music' | 'studio' | 'minimal') => void;
}

export const PRESETS: WindowPreset[] = [
  {
    id: 'default',
    name: 'Standard Floating HUD',
    description: 'Balanced size for desktop viewing',
    width: 480,
    height: 580,
  },
  {
    id: 'compact',
    name: 'Compact Mini Player',
    description: 'Minimal corner footprint',
    width: 360,
    height: 420,
  },
  {
    id: 'sidebar',
    name: 'Tall Right Sidebar',
    description: 'Full-height stream alongside your work',
    width: 420,
    height: 720,
  },
  {
    id: 'stage',
    name: 'Karaoke Stage View',
    description: 'Wide expansive screen for party singing',
    width: 760,
    height: 600,
  },
];

export const BackgroundDesktop: React.FC<BackgroundDesktopProps> = ({
  currentSong,
  isPlaying,
  onApplyPreset,
  backgroundTheme,
  onChangeBackgroundTheme,
}) => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
      {/* Dynamic Background Backdrop */}
      {backgroundTheme === 'amazon-music' ? (
        /* Realistic Amazon Music Web/Desktop App Mockup */
        <div className="w-full h-full bg-[#0a0e17] flex flex-col opacity-65 pointer-events-auto">
          {/* Mock Navigation Header */}
          <div className="h-12 border-b border-slate-800/80 px-6 flex items-center justify-between text-xs text-slate-400 bg-slate-950/40">
            <div className="flex items-center gap-6">
              <span className="font-bold text-white tracking-wide text-sm flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-cyan-400" /> amazon music
              </span>
              <span className="hover:text-white cursor-pointer font-medium text-white">HOME</span>
              <span className="hover:text-white cursor-pointer">PODCASTS</span>
              <span className="hover:text-white cursor-pointer">LIBRARY</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Amazon Music Unlimited</span>
              </div>
            </div>
          </div>

          {/* Mock Main Amazon Music Stage */}
          <div className="flex-1 p-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-center max-w-6xl mx-auto w-full">
            <div className="md:col-span-4 flex flex-col items-center text-center">
              <div className="relative group shadow-2xl rounded-2xl overflow-hidden border border-slate-800">
                <img
                  src={currentSong.albumArt}
                  alt={currentSong.title}
                  className="w-64 h-64 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                  <span className="text-xs text-white/90 font-medium">ULTRA HD AUDIO</span>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mt-4 tracking-tight">
                {currentSong.title}
              </h2>
              <p className="text-sm text-cyan-400 font-medium mt-1">{currentSong.artist}</p>
              <p className="text-xs text-slate-500 mt-0.5">{currentSong.album}</p>
            </div>

            <div className="md:col-span-8 flex flex-col justify-center space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Live Stream Playback Status
                  </span>
                  <span className="text-xs text-cyan-400 font-mono">24-bit / 192 kHz FLAC</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  The floating glass lyrics window is active above this playback surface. You can
                  move it anywhere, calibrate timing offset, adjust opacity from 15% to 100%, and
                  toggle synchronized karaoke scrolling.
                </p>

                {/* Preset placement buttons */}
                <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap gap-2">
                  <span className="text-xs text-slate-400 py-1 font-medium">Window Layout Presets:</span>
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onApplyPreset(p)}
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700/60 transition-colors pointer-events-auto"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : backgroundTheme === 'studio' ? (
        /* Ambient Studio Glow Backdrop */
        <div className="w-full h-full bg-[#070a13] relative pointer-events-auto">
          <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="p-8 max-w-4xl mx-auto flex flex-col justify-center h-full text-center">
            <h1 className="text-4xl font-extrabold text-white tracking-tight">
              Floating Lyrics Display
            </h1>
            <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
              Drag the floating window anywhere on screen. Adjust opacity to see underlying work.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onApplyPreset(p)}
                  className="px-3 py-1.5 text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors pointer-events-auto"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Clean Minimal Dark Slate */
        <div className="w-full h-full bg-[#06080e] pointer-events-auto flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
              Minimal Workspace Mode
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onApplyPreset(p)}
                  className="px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 pointer-events-auto"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Backdrop Theme Switcher Floating Pill in Bottom-Left */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-auto flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-xl p-1 text-xs text-slate-300 shadow-xl backdrop-blur-md">
        <span className="text-[10px] text-slate-500 font-semibold px-2 uppercase tracking-wider">
          Backdrop:
        </span>
        <button
          onClick={() => onChangeBackgroundTheme('amazon-music')}
          className={`px-2 py-0.5 rounded-lg transition-colors text-[11px] font-medium ${
            backgroundTheme === 'amazon-music'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'hover:text-white'
          }`}
        >
          Amazon Music
        </button>
        <button
          onClick={() => onChangeBackgroundTheme('studio')}
          className={`px-2 py-0.5 rounded-lg transition-colors text-[11px] font-medium ${
            backgroundTheme === 'studio'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'hover:text-white'
          }`}
        >
          Studio Glow
        </button>
        <button
          onClick={() => onChangeBackgroundTheme('minimal')}
          className={`px-2 py-0.5 rounded-lg transition-colors text-[11px] font-medium ${
            backgroundTheme === 'minimal'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'hover:text-white'
          }`}
        >
          Clean Slate
        </button>
      </div>
    </div>
  );
};
