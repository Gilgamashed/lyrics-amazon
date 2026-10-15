import React from 'react';
import { AppSettings, BackgroundTheme, FontSize, LayoutPresetId, WindowTheme } from '../types/lyrics';
import { LAYOUT_PRESETS } from '../services/layoutPresets';
import {
  X,
  SlidersHorizontal,
  Layout,
  Image,
  Layers,
  Type,
  Palette,
  Timer,
  RotateCcw,
  Check,
} from 'lucide-react';

interface OptionsMenuProps {
  settings: AppSettings;
  onChange: (updates: Partial<AppSettings>) => void;
  onResetHistory: () => void;
}

const FONT_SIZES: FontSize[] = ['small', 'medium', 'large', 'xlarge'];
const THEMES: { id: WindowTheme; label: string }[] = [
  { id: 'acrylic', label: 'Acrylic Glass' },
  { id: 'midnight', label: 'Midnight Blue' },
  { id: 'obsidian', label: 'Deep Obsidian' },
  { id: 'cyan', label: 'Cyan Cyber' },
];
const BACKDROPS: { id: BackgroundTheme; label: string }[] = [
  { id: 'amazon-music', label: 'Amazon Music' },
  { id: 'studio', label: 'Studio Glow' },
  { id: 'minimal', label: 'Clean Slate' },
];
/**
 * The single customization surface. Consolidates window layout presets,
 * backdrop theme, appearance (opacity/blur/font/palette) and the default sync
 * offset. The inert AI Options section was removed (deferred).
 */
export const OptionsMenu: React.FC<OptionsMenuProps> = ({ settings, onChange, onResetHistory }) => {
  const [isOpen, setOpen] = React.useState(false);

  const setWindow = (updates: Partial<AppSettings['window']>) =>
    onChange({ window: { ...settings.window, ...updates } });

  const resetOffset = () => onChange({ syncOffsetMs: 0 });

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Options"
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Options</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[75vh] overflow-y-auto custom-scrollbar bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-3.5 z-50 text-slate-200">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" /> Options
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Layout presets */}
          <section className="mb-4">
            <span className="text-xs text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Layout className="w-3.5 h-3.5 text-cyan-400" /> Lyrics Layout
            </span>
            <div className="grid grid-cols-3 gap-1">
              {LAYOUT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChange({ layoutPreset: preset.id as LayoutPresetId })}
                  title={preset.description}
                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                    settings.layoutPreset === preset.id
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </section>

          {/* Backdrop theme */}
          <section className="mb-4">
            <span className="text-xs text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-cyan-400" /> Backdrop
            </span>
            <div className="grid grid-cols-3 gap-1">
              {(['amazon-music', 'studio', 'minimal'] as BackgroundTheme[]).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => onChange({ backgroundTheme: theme })}
                  className={`px-1.5 py-1 text-[11px] rounded transition-colors ${
                    settings.backgroundTheme === theme
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {theme === 'amazon-music' ? 'Amazon' : theme === 'studio' ? 'Studio' : 'Minimal'}
                </button>
              ))}
            </div>
          </section>

          {/* Appearance */}
          <section className="mb-4">
            <span className="text-xs text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" /> Appearance
            </span>

            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">Glass Opacity</span>
                <span className="font-mono text-cyan-400 text-[11px]">
                  {Math.round(settings.window.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={settings.window.opacity}
                aria-label="Glass opacity"
                onChange={(e) => onChange({ window: { ...settings.window, opacity: parseFloat(e.target.value) } })}
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">Backdrop Blur</span>
                <span className="font-mono text-cyan-400 text-[11px]">
                  {settings.window.blur}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                step={2}
                value={settings.window.blur}
                aria-label="Backdrop blur"
                onChange={(e) => onChange({ window: { ...settings.window, blur: parseInt(e.target.value, 10) } })}
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="mb-2">
              <span className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <Type className="w-3 h-3" /> Lyric Text Size
              </span>
              <div className="grid grid-cols-4 gap-1">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onChange({ window: { ...settings.window, fontSize: size } })}
                    className={`py-1 text-xs rounded font-medium capitalize transition-colors ${
                      settings.window.fontSize === size
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {size === 'xlarge' ? 'XL' : size.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                <Palette className="w-3 h-3" /> Theme Palette
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onChange({ window: { ...settings.window, theme: theme.id } })}
                    className={`px-2 py-1 text-xs rounded transition-colors text-left flex items-center justify-between ${
                      settings.window.theme === theme.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{theme.label}</span>
                    {settings.window.theme === theme.id && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Default sync offset */}
          <section className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-300 flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-cyan-400" /> Default Sync Offset
              </span>
              <button
                type="button"
                onClick={resetOffset}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[-500, -100, 100, 500].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() =>
                    onChange({ syncOffsetMs: settings.syncOffsetMs + delta })
                  }
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 font-mono"
                >
                  {delta > 0 ? '+' : ''}
                  {(delta / 1000).toFixed(1)}s
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 text-center font-mono mt-1.5">
              Current: {settings.syncOffsetMs > 0 ? '+' : ''}
              {(settings.syncOffsetMs / 1000).toFixed(2)}s
            </div>
          </section>

          {/* Play history */}
          <section className="pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onResetHistory}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-lg border border-slate-700/60 bg-slate-800 text-slate-300 hover:text-white transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Most Listened
            </button>
          </section>
        </div>
      )}
    </div>
  );
};
