import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Song,
  LyricsData,
  WindowState,
  WindowPreset,
  AIConfig,
  NowPlaying,
  DetectionSource,
} from './types/lyrics';
import { CURATED_TRACKS, CURATED_LYRICS_DATA } from './services/curatedTracks';
import { fetchLyrics } from './services/lyricsService';
import { resolveAIConfig } from './services/aiService';
import { createBridgeClient, BridgeConnectionState } from './services/bridgeService';
import { AmazonMusicBar } from './components/AmazonMusicBar';
import { FloatingLyricsWindow } from './components/FloatingLyricsWindow';
import { BackgroundDesktop } from './components/BackgroundDesktop';
import { APP_VERSION } from './appVersion';

function resolveDesktopSong(nowPlaying: NowPlaying): Song {
  const title = nowPlaying.title?.trim() || 'Unknown Track';
  const artist = nowPlaying.artist?.trim() || 'Unknown Artist';

  const curated = CURATED_TRACKS.find(
    (track) =>
      track.title.toLowerCase() === title.toLowerCase() &&
      track.artist.toLowerCase() === artist.toLowerCase()
  );
  if (curated) return curated;

  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  return {
    id: `desktop-${slug(title)}-${slug(artist)}`,
    title,
    artist,
    album: nowPlaying.album?.trim() || 'Amazon Music',
    albumArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
    durationMs:
      nowPlaying.durationMs && nowPlaying.durationMs > 0 ? nowPlaying.durationMs : 180000,
    amazonMusicUrl: `https://music.amazon.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
    genre: 'Now Playing (Desktop)',
  };
}

export default function App() {
  const [currentSong, setCurrentSong] = useState<Song>(CURATED_TRACKS[0]);
  const [lyricsData, setLyricsData] = useState<LyricsData>(
    CURATED_LYRICS_DATA['espresso-sabrina-carpenter']
  );
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);

  // Session-only AI fallback config (endpoint/model prefilled from env; key never persisted)
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => resolveAIConfig());

  // Playback & Timing state
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [syncOffsetMs, setSyncOffsetMs] = useState(0);
  const [isMediaSessionActive, setIsMediaSessionActive] = useState(true);

  // Native companion bridge (desktop app detection)
  const [bridgeStatus, setBridgeStatus] = useState<BridgeConnectionState>('connecting');
  const lastDesktopTrackKeyRef = useRef<string | null>(null);
  const desktopHandlerRef = useRef<(nowPlaying: NowPlaying) => void>(() => {});

  // Background environment theme
  const [backgroundTheme, setBackgroundTheme] = useState<'amazon-music' | 'studio' | 'minimal'>(
    'amazon-music'
  );

  // Floating Window State
  const [windowState, setWindowState] = useState<WindowState>(() => {
    // Initial responsive window position
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const initialWidth = Math.min(500, screenW - 40);
    const initialX = Math.max(20, screenW - initialWidth - 40);

    return {
      x: initialX,
      y: 90,
      width: initialWidth,
      height: 600,
      opacity: 0.9,
      blur: 16,
      isPinned: true,
      isMinimized: false,
      isMaximized: false,
      viewMode: 'karaoke',
      theme: 'acrylic',
      fontSize: 'medium',
      autoScroll: true,
      showAnnotations: false,
    };
  });

  // Track playback time accurately using Date.now()
  const lastTickTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    let animationFrameId: number;

    const tick = () => {
      const now = Date.now();
      const delta = now - lastTickTimeRef.current;
      lastTickTimeRef.current = now;

      if (isPlaying) {
        setCurrentTimeMs((prev) => {
          const next = prev + delta;
          if (next >= currentSong.durationMs) {
            // Loop or reset
            return 0;
          }
          return next;
        });
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    lastTickTimeRef.current = Date.now();
    animationFrameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, currentSong.durationMs]);

  // Load lyrics for a song using the given AI config (optionally bypassing caches)
  const loadLyrics = useCallback(async (song: Song, config: AIConfig, useCache = true) => {
    setIsLoadingLyrics(true);
    try {
      const data = await fetchLyrics(song, { useCache, aiConfig: config });
      setLyricsData(data);
    } catch {
      // Keep previous or fallback
    } finally {
      setIsLoadingLyrics(false);
    }
  }, []);

  // When song changes, fetch lyrics
  const handleSelectSong = async (song: Song) => {
    setCurrentSong(song);
    setCurrentTimeMs(0);
    await loadLyrics(song, aiConfig);
  };

  // Save session-only AI config and retry the current track (bypasses caches)
  const handleSaveAIConfig = async (config: AIConfig) => {
    setAiConfig(config);
    await loadLyrics(currentSong, config, false);
  };

  // Keep the desktop bridge handler bound to the latest AI config without reconnecting
  useEffect(() => {
    desktopHandlerRef.current = (nowPlaying: NowPlaying) => {
      if (typeof nowPlaying.positionMs === 'number') {
        setCurrentTimeMs(nowPlaying.positionMs);
      }
      setIsPlaying(nowPlaying.isPlaying);

      const title = nowPlaying.title?.trim();
      if (!nowPlaying.isPlaying || !title) return;

      const key = `${title.toLowerCase()}|${(nowPlaying.artist ?? '').trim().toLowerCase()}`;
      if (key === lastDesktopTrackKeyRef.current) return;
      lastDesktopTrackKeyRef.current = key;

      const song = resolveDesktopSong(nowPlaying);
      setCurrentSong(song);
      void loadLyrics(song, aiConfig);
    };
  });

  // Connect to the localhost native bridge; degrade gracefully to browser Media Session
  useEffect(() => {
    const client = createBridgeClient({
      onConnectionChange: setBridgeStatus,
      onNowPlaying: (nowPlaying) => desktopHandlerRef.current(nowPlaying),
    });
    client.start();
    return () => client.stop();
  }, []);

  const detectionSource: DetectionSource = bridgeStatus === 'connected' ? 'desktop' : 'browser';

  // Media Session API Sync
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentSong.title,
          artist: currentSong.artist,
          album: currentSong.album,
          artwork: [
            {
              src: currentSong.albumArt,
              sizes: '300x300',
              type: 'image/jpeg',
            },
          ],
        });

        navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
        navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            setCurrentTimeMs(details.seekTime * 1000);
          }
        });
      } catch {
        // Media session unsupported in some restricted iframes
      }
    }
  }, [currentSong]);

  const handleUpdateWindowState = useCallback((updates: Partial<WindowState>) => {
    setWindowState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleApplyPreset = (preset: WindowPreset) => {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const targetW = Math.min(preset.width, screenW - 40);
    const targetH = Math.min(preset.height, screenH - 120);

    let targetX = screenW - targetW - 30;
    let targetY = 90;

    if (preset.id === 'stage') {
      targetX = Math.max(20, (screenW - targetW) / 2);
    } else if (preset.id === 'compact') {
      targetX = screenW - targetW - 24;
      targetY = screenH - targetH - 24;
    }

    setWindowState((prev) => ({
      ...prev,
      width: targetW,
      height: targetH,
      x: targetX,
      y: targetY,
      isMaximized: false,
      isMinimized: false,
    }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 flex flex-col select-none">
      {/* ─── Top Amazon Music Bar (Controls, Search, Auto-Detect, Offset) ── */}
      <AmazonMusicBar
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTimeMs={currentTimeMs}
        syncOffsetMs={syncOffsetMs}
        isMediaSessionActive={isMediaSessionActive}
        detectionSource={detectionSource}
        aiConfig={aiConfig}
        isBusy={isLoadingLyrics}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        onSeek={(timeMs) => setCurrentTimeMs(timeMs)}
        onOffsetChange={(offsetMs) => setSyncOffsetMs(offsetMs)}
        onSelectSong={handleSelectSong}
        onToggleMediaSession={() => setIsMediaSessionActive((prev) => !prev)}
        onSaveAIConfig={handleSaveAIConfig}
      />

      {/* ─── Mock Desktop Canvas Surface ─────────────────────────────── */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {/* Underneath desktop background that shines through the translucent glass window */}
        <BackgroundDesktop
          currentSong={currentSong}
          isPlaying={isPlaying}
          onApplyPreset={handleApplyPreset}
          backgroundTheme={backgroundTheme}
          onChangeBackgroundTheme={setBackgroundTheme}
        />

        {/* ─── The Floating Resizable Lyrics Glass Window ─────────────── */}
        <FloatingLyricsWindow
          windowState={windowState}
          lyricsData={lyricsData}
          currentTimeMs={currentTimeMs}
          syncOffsetMs={syncOffsetMs}
          onUpdateWindowState={handleUpdateWindowState}
          onSeek={(timeMs) => setCurrentTimeMs(timeMs)}
        />
      </div>

      {/* ─── Version annotation (translucent, bottom-right) ──────────── */}
      <span
        data-testid="app-version"
        className="pointer-events-none fixed bottom-1 right-2 z-[60] select-none font-mono text-[10px] leading-none tracking-wider text-slate-400/40"
      >
        v{APP_VERSION}
      </span>
    </div>
  );
}
