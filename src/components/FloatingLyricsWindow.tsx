import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  WindowState,
  LyricsData,
  LyricLine,
  ViewMode,
  FontSize,
  WindowTheme,
} from '../types/lyrics';
import { KaraokeLyricsView } from './KaraokeLyricsView';
import { FullSheetLyricsView } from './FullSheetLyricsView';
import { GeniusAnnotationsPanel } from './GeniusAnnotationsPanel';
import {
  Pin,
  Minus,
  Maximize2,
  Minimize2,
  Sparkles,
  Sliders,
  Type,
  BookOpen,
  Music2,
  Move,
  Layers,
  Check,
} from 'lucide-react';

interface FloatingLyricsWindowProps {
  windowState: WindowState;
  lyricsData: LyricsData;
  currentTimeMs: number;
  syncOffsetMs: number;
  onUpdateWindowState: (updates: Partial<WindowState>) => void;
  onSeek: (timeMs: number) => void;
}

export const FloatingLyricsWindow: React.FC<FloatingLyricsWindowProps> = ({
  windowState,
  lyricsData,
  currentTimeMs,
  syncOffsetMs,
  onUpdateWindowState,
  onSeek,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingDirection, setResizingDirection] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    windowX: 0,
    windowY: 0,
  });

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  const windowRef = useRef<HTMLDivElement>(null);

  // Dragging logic
  const handlePointerDownDrag = (e: React.PointerEvent) => {
    // Only drag from title bar and when not clicking buttons
    if ((e.target as HTMLElement).closest('button, input, select, .no-drag')) {
      return;
    }
    if (windowState.isMaximized) return;

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - windowState.x,
      y: e.clientY - windowState.y,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMoveDrag = useCallback(
    (e: PointerEvent) => {
      if (isDragging) {
        const newX = Math.max(10, Math.min(window.innerWidth - 120, e.clientX - dragOffset.x));
        const newY = Math.max(65, Math.min(window.innerHeight - 80, e.clientY - dragOffset.y));
        onUpdateWindowState({ x: newX, y: newY });
      } else if (resizingDirection) {
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = resizeStart.windowX;
        let newY = resizeStart.windowY;

        if (resizingDirection.includes('e')) {
          newWidth = Math.max(340, resizeStart.width + dx);
        }
        if (resizingDirection.includes('s')) {
          newHeight = Math.max(280, resizeStart.height + dy);
        }
        if (resizingDirection.includes('w')) {
          const proposedWidth = resizeStart.width - dx;
          if (proposedWidth >= 340) {
            newWidth = proposedWidth;
            newX = resizeStart.windowX + dx;
          }
        }
        if (resizingDirection.includes('n')) {
          const proposedHeight = resizeStart.height - dy;
          if (proposedHeight >= 280) {
            newHeight = proposedHeight;
            newY = resizeStart.windowY + dy;
          }
        }

        onUpdateWindowState({
          width: newWidth,
          height: newHeight,
          x: newX,
          y: newY,
        });
      }
    },
    [isDragging, resizingDirection, dragOffset, resizeStart, onUpdateWindowState]
  );

  const handlePointerUpDrag = useCallback(() => {
    setIsDragging(false);
    setResizingDirection(null);
  }, []);

  useEffect(() => {
    if (isDragging || resizingDirection) {
      window.addEventListener('pointermove', handlePointerMoveDrag);
      window.addEventListener('pointerup', handlePointerUpDrag);
      return () => {
        window.removeEventListener('pointermove', handlePointerMoveDrag);
        window.removeEventListener('pointerup', handlePointerUpDrag);
      };
    }
  }, [isDragging, resizingDirection, handlePointerMoveDrag, handlePointerUpDrag]);

  // Resizing start handler
  const handleResizePointerDown = (direction: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingDirection(direction);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: windowState.width,
      height: windowState.height,
      windowX: windowState.x,
      windowY: windowState.y,
    });
  };

  // Minimized floating pill representation
  if (windowState.isMinimized) {
    return (
      <div
        style={{
          left: `${windowState.x}px`,
          top: `${windowState.y}px`,
        }}
        onPointerDown={handlePointerDownDrag}
        className="fixed z-50 flex items-center gap-2.5 px-3 py-2 bg-slate-900/90 backdrop-blur-xl border border-cyan-500/40 rounded-full shadow-2xl cursor-grab active:cursor-grabbing hover:border-cyan-400 select-none group"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
        <span className="text-xs font-bold text-white tracking-wide">
          Lyrics: {lyricsData.title}
        </span>
        <button
          onClick={() => onUpdateWindowState({ isMinimized: false })}
          className="ml-1 p-1 rounded-full bg-white/10 hover:bg-cyan-500 hover:text-slate-950 transition-colors"
          title="Restore window"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Theme style classes
  const getThemeClass = (theme: WindowTheme) => {
    switch (theme) {
      case 'midnight':
        return 'bg-slate-950';
      case 'obsidian':
        return 'bg-zinc-950';
      case 'cyan':
        return 'bg-slate-950/90 border-cyan-500/40 shadow-cyan-500/20';
      case 'acrylic':
      default:
        return 'bg-slate-900/80';
    }
  };

  const windowStyle: React.CSSProperties = windowState.isMaximized
    ? {
        position: 'fixed',
        left: '12px',
        top: '74px',
        width: 'calc(100vw - 24px)',
        height: 'calc(100vh - 86px)',
        zIndex: windowState.isPinned ? 50 : 40,
        opacity: windowState.opacity,
        backdropFilter: `blur(${windowState.blur}px)`,
      }
    : {
        position: 'fixed',
        left: `${windowState.x}px`,
        top: `${windowState.y}px`,
        width: `${windowState.width}px`,
        height: `${windowState.height}px`,
        zIndex: windowState.isPinned ? 50 : 40,
        opacity: windowState.opacity,
        backdropFilter: `blur(${windowState.blur}px)`,
      };

  return (
    <div
      ref={windowRef}
      style={windowStyle}
      className={`flex flex-col rounded-2xl border transition-shadow duration-200 overflow-hidden ${
        windowState.isPinned
          ? 'border-cyan-400 shadow-[0_0_35px_rgba(0,168,225,0.35)]'
          : 'border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.6)]'
      } ${getThemeClass(windowState.theme)} select-none`}
    >
      {/* ─── Window Title Bar ────────────────────────────────────────── */}
      <div
        onPointerDown={handlePointerDownDrag}
        className={`px-4 py-3 flex items-center justify-between gap-3 border-b border-white/10 shrink-0 cursor-grab active:cursor-grabbing ${
          windowState.isPinned ? 'bg-cyan-950/50' : 'bg-white/5'
        }`}
      >
        {/* Left: Window Dots & Title Lockup */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Red / Close or minimize */}
            <button
              onClick={() => onUpdateWindowState({ isMinimized: true })}
              className="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-400 transition-colors"
              title="Minimize to floating pill"
            />
            {/* Yellow / Pin toggle */}
            <button
              onClick={() => onUpdateWindowState({ isPinned: !windowState.isPinned })}
              className={`w-3 h-3 rounded-full transition-colors ${
                windowState.isPinned ? 'bg-cyan-400' : 'bg-amber-500/80 hover:bg-amber-400'
              }`}
              title="Toggle pin / always on top"
            />
            {/* Green / Maximize toggle */}
            <button
              onClick={() => onUpdateWindowState({ isMaximized: !windowState.isMaximized })}
              className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-400 transition-colors"
              title="Toggle maximize"
            />
          </div>

          <div className="min-w-0 ml-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate tracking-tight">
                {lyricsData.title}
              </span>
              <span className="text-[10px] text-slate-400 truncate">
                · {lyricsData.artist}
              </span>
            </div>
          </div>
        </div>

        {/* Center: View Mode Segmented Switcher */}
        <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10 shrink-0 no-drag">
          <button
            onClick={() => onUpdateWindowState({ viewMode: 'karaoke' })}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              windowState.viewMode === 'karaoke'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Karaoke (Synced)
          </button>
          <button
            onClick={() => onUpdateWindowState({ viewMode: 'sheet' })}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              windowState.viewMode === 'sheet'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Full Sheet
          </button>
        </div>

        {/* Right: Window Controls & Tools */}
        <div className="flex items-center gap-1.5 shrink-0 no-drag">
          {/* Genius Trivia / Annotations Drawer Toggle */}
          <button
            onClick={() =>
              onUpdateWindowState({ showAnnotations: !windowState.showAnnotations })
            }
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              windowState.showAnnotations
                ? 'bg-amber-400 text-slate-950 shadow-sm shadow-amber-400/25'
                : 'bg-white/10 text-amber-300 hover:bg-amber-400/20'
            }`}
            title="Genius verified notes and trivia"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Genius</span>
          </button>

          {/* Window Styling & Opacity Settings Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className={`p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors ${
                showSettingsMenu ? 'bg-white/15 text-white' : ''
              }`}
              title="Window appearance & glass translucency settings"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            {showSettingsMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3.5 z-50 text-slate-200">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" /> Glass Window Controls
                  </span>
                  <button
                    onClick={() => setShowSettingsMenu(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                {/* Opacity Slider */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300">Glass Opacity</span>
                    <span className="font-mono text-cyan-400 text-[11px]">
                      {Math.round(windowState.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={1.0}
                    step={0.05}
                    value={windowState.opacity}
                    onChange={(e) =>
                      onUpdateWindowState({ opacity: parseFloat(e.target.value) })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Blur Slider */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300">Backdrop Blur</span>
                    <span className="font-mono text-cyan-400 text-[11px]">
                      {windowState.blur}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={2}
                    value={windowState.blur}
                    onChange={(e) =>
                      onUpdateWindowState({ blur: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Font Size Selector */}
                <div className="mb-3">
                  <span className="text-xs text-slate-300 block mb-1.5">Lyric Text Size</span>
                  <div className="grid grid-cols-4 gap-1">
                    {(['small', 'medium', 'large', 'xlarge'] as FontSize[]).map((size) => (
                      <button
                        key={size}
                        onClick={() => onUpdateWindowState({ fontSize: size })}
                        className={`py-1 text-xs rounded font-medium capitalize transition-colors ${
                          windowState.fontSize === size
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {size === 'xlarge' ? 'XL' : size.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Selector */}
                <div>
                  <span className="text-xs text-slate-300 block mb-1.5">Theme Palette</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'acrylic', label: 'Acrylic Glass' },
                        { id: 'midnight', label: 'Midnight Blue' },
                        { id: 'obsidian', label: 'Deep Obsidian' },
                        { id: 'cyan', label: 'Cyan Cyber' },
                      ] as { id: WindowTheme; label: string }[]
                    ).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onUpdateWindowState({ theme: t.id })}
                        className={`px-2 py-1 text-xs rounded transition-colors text-left flex items-center justify-between ${
                          windowState.theme === t.id
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>{t.label}</span>
                        {windowState.theme === t.id && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pin Button */}
          <button
            onClick={() => onUpdateWindowState({ isPinned: !windowState.isPinned })}
            className={`p-1.5 rounded-lg transition-colors ${
              windowState.isPinned
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title={windowState.isPinned ? 'Unpin window' : 'Pin window always on top'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={() => onUpdateWindowState({ isMaximized: !windowState.isMaximized })}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title={windowState.isMaximized ? 'Restore size' : 'Maximize window'}
          >
            {windowState.isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ─── Main Window Viewport Split (Lyrics + Genius Drawer) ───────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Lyrics Area */}
        <div className="flex-1 h-full overflow-hidden">
          {windowState.viewMode === 'karaoke' ? (
            <KaraokeLyricsView
              lyrics={lyricsData.syncedLyrics}
              currentTimeMs={currentTimeMs}
              syncOffsetMs={syncOffsetMs}
              fontSize={windowState.fontSize}
              autoScroll={windowState.autoScroll}
              onSeek={onSeek}
              onSelectAnnotation={(annId) => {
                setActiveAnnotationId(annId);
                onUpdateWindowState({ showAnnotations: true });
              }}
              annotations={lyricsData.annotations}
            />
          ) : (
            <FullSheetLyricsView
              lyrics={lyricsData.syncedLyrics}
              plainLyrics={lyricsData.plainLyrics}
              songTitle={lyricsData.title}
              artist={lyricsData.artist}
              fontSize={windowState.fontSize}
              onSeek={onSeek}
            />
          )}
        </div>

        {/* Genius Annotations & Trivia Drawer */}
        {windowState.showAnnotations && (
          <div className="w-80 h-full shrink-0 animate-in slide-in-from-right duration-200">
            <GeniusAnnotationsPanel
              lyricsData={lyricsData}
              activeAnnotationId={activeAnnotationId}
              onClose={() => onUpdateWindowState({ showAnnotations: false })}
              onSelectAnnotation={setActiveAnnotationId}
            />
          </div>
        )}
      </div>

      {/* ─── Bottom Status & Quick Sync Bar ──────────────────────────── */}
      <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 bg-black/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1">
            <Music2 className="w-3 h-3" /> Provider: {lyricsData.provider}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] text-slate-400">
            {lyricsData.syncedLyrics.length} lines parsed
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] hover:text-white">
            <input
              type="checkbox"
              checked={windowState.autoScroll}
              onChange={(e) => onUpdateWindowState({ autoScroll: e.target.checked })}
              className="accent-cyan-400 rounded w-3.5 h-3.5"
            />
            <span>Auto-Scroll</span>
          </label>
        </div>
      </div>

      {/* ─── Multi-Directional Resize Handles ─────────────────────────── */}
      {!windowState.isMaximized && (
        <>
          <div
            onPointerDown={(e) => handleResizePointerDown('e', e)}
            className="absolute top-3 right-0 w-2 bottom-3 cursor-e-resize hover:bg-cyan-400/30 transition-colors"
          />
          <div
            onPointerDown={(e) => handleResizePointerDown('w', e)}
            className="absolute top-3 left-0 w-2 bottom-3 cursor-w-resize hover:bg-cyan-400/30 transition-colors"
          />
          <div
            onPointerDown={(e) => handleResizePointerDown('s', e)}
            className="absolute bottom-0 left-3 right-3 h-2 cursor-s-resize hover:bg-cyan-400/30 transition-colors"
          />
          <div
            onPointerDown={(e) => handleResizePointerDown('n', e)}
            className="absolute top-0 left-3 right-3 h-2 cursor-n-resize hover:bg-cyan-400/30 transition-colors"
          />
          <div
            onPointerDown={(e) => handleResizePointerDown('se', e)}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-cyan-400/50 rounded-br-2xl transition-colors"
          />
          <div
            onPointerDown={(e) => handleResizePointerDown('sw', e)}
            className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize hover:bg-cyan-400/50 rounded-bl-2xl transition-colors"
          />
          <div
            onPointerDown={(e) => handleResizePointerDown('ne', e)}
            className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize hover:bg-cyan-400/50 rounded-tr-2xl transition-colors"
          />
          <div
            onPointerDown={(e) => handleResizePointerDown('nw', e)}
            className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize hover:bg-cyan-400/50 rounded-tl-2xl transition-colors"
          />
        </>
      )}
    </div>
  );
};
