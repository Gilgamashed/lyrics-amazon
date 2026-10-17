import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Song,
  LyricsData,
  AppSettings,
  NowPlaying,
  DetectionSource,
  FeedbackState,
  ViewMode,
} from './types/lyrics';
import { fetchLyrics } from './services/lyricsService';
import { resolveAIConfig } from './services/aiService';
import { saveAcceptedLyrics } from './services/userLyricsStore';
import { createBridgeClient, BridgeConnectionState } from './services/bridgeService';
import { loadSettings, saveSettings } from './services/settingsStore';
import { PlaySessionScorer, recordPlay, resetHistory } from './services/playHistoryStore';
import { layoutWidthFor } from './services/layoutPresets';
import {
  nextClockPositionMs,
  resolveDuration,
  ClockAnchor,
} from './services/playbackClock';
import { sanitizeMetadata, SanitizedMetadata } from './services/metadataSanitizer';
import { getOverride, setOverride, removeOverride, trackKey } from './services/metaOverrideStore';
import { LatestRequest } from './services/latestRequest';
import { NowPlayingHeader } from './components/NowPlayingHeader';
import { LyricsPanel } from './components/LyricsPanel';
import { MostListenedPanel } from './components/MostListenedPanel';
import { BackgroundBackdrop } from './components/BackgroundBackdrop';
import { OptionsMenu } from './components/OptionsMenu';
import { APP_VERSION } from './appVersion';

const PROVIDER_ORDER: LyricsData['provider'][] = ['Genius', 'LRCLIB'];

function providerIndexFor(label: LyricsData['provider']): number {
  const idx = PROVIDER_ORDER.indexOf(label);
  return idx === -1 ? PROVIDER_ORDER.length : idx;
}

function emptyLyricsData(song: Song): LyricsData {
  return {
    songId: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArt: song.albumArt,
    syncedLyrics: [],
    plainLyrics: '',
    provider: 'None',
    annotations: [],
    trivia: [],
  };
}

const IDLE_SONG: Song = {
  id: 'idle',
  title: 'Nothing Playing',
  artist: 'Start Amazon Music to detect the current track',
  album: 'Amazon Music',
  albumArt: '',
  durationMs: 0,
};

function resolveDesktopSong(nowPlaying: NowPlaying, metadata: SanitizedMetadata): Song {
  const { title, artist } = metadata;
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  const { durationMs } = resolveDuration(nowPlaying.durationMs);

  return {
    id: `desktop-${slug(title)}-${slug(artist)}`,
    title,
    artist,
    album: nowPlaying.album?.trim() || 'Amazon Music',
    albumArt: nowPlaying.albumArt ?? '',
    durationMs,
    amazonMusicUrl: `https://music.amazon.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
    genre: 'Now Playing (Desktop)',
  };
}

export default function App() {
  const [currentSong, setCurrentSong] = useState<Song>(IDLE_SONG);
  const [lyricsData, setLyricsData] = useState<LyricsData>(() => emptyLyricsData(IDLE_SONG));
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('none');
  const lastProviderIndexRef = useRef(0);
  const latestRequestRef = useRef(new LatestRequest());

  // Session-only AI fallback config (used silently; no longer surfaced in the UI)
  const [aiConfig] = useState(() => resolveAIConfig());

  // Persisted customization settings (layout preset, backdrop, appearance, offset)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // Most Listened view state
  const [showHistory, setShowHistory] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  // ─── Playback clock ─────────────────────────────────────────────────
  // The desktop bridge's NowPlaying.positionMs is authoritative; the local
  // clock interpolates between snapshots while playing and never loops.
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const anchorRef = useRef<ClockAnchor>({
    positionMs: 0,
    atMs: Date.now(),
    playing: false,
    durationMs: 0,
    durationAuthoritative: false,
  });
  const currentSongRef = useRef<Song>(IDLE_SONG);
  const detectionRef = useRef<DetectionSource>('browser');
  const isAmazonRef = useRef(false);
  const scorerRef = useRef<PlaySessionScorer>(new PlaySessionScorer());

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  const applySnapshot = useCallback(
    (positionMs: number, playing: boolean, durationMs: number, durationAuthoritative: boolean) => {
      anchorRef.current = { positionMs, atMs: Date.now(), playing, durationMs, durationAuthoritative };
      setCurrentTimeMs(positionMs);
    },
    []
  );

  const setPlayingState = useCallback((playing: boolean) => {
    const anchor = anchorRef.current;
    const now = Date.now();
    const positionMs = anchor.playing
      ? anchor.positionMs + (now - anchor.atMs)
      : anchor.positionMs;
    anchorRef.current = { ...anchor, positionMs, atMs: now, playing };
    setCurrentTimeMs(positionMs);
  }, []);

  const handleSeek = useCallback((timeMs: number) => {
    const anchor = anchorRef.current;
    anchorRef.current = { ...anchor, positionMs: timeMs, atMs: Date.now() };
    setCurrentTimeMs(timeMs);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const anchor = anchorRef.current;
      if (anchor.playing) {
        const next = nextClockPositionMs(anchor, Date.now());
        setCurrentTimeMs(next);

        // Award a play only for real Amazon playback (desktop) after >= 30s.
        if (detectionRef.current === 'desktop' && isAmazonRef.current) {
          if (scorerRef.current.addPosition(next)) {
            recordPlay(currentSongRef.current, 'amazon', Date.now());
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Native companion bridge (desktop app detection)
  const [bridgeStatus, setBridgeStatus] = useState<BridgeConnectionState>('connecting');
  const [detectedAppId, setDetectedAppId] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const lastDesktopTrackKeyRef = useRef<string | null>(null);
  const lastNowPlayingRef = useRef<NowPlaying | null>(null);
  const desktopHandlerRef = useRef<(nowPlaying: NowPlaying) => void>(() => {});

  const detectionSource: DetectionSource = bridgeStatus === 'connected' ? 'desktop' : 'browser';
  useEffect(() => {
    detectionRef.current = detectionSource;
  }, [detectionSource]);

  const applyAutoViewMode = useCallback((viewMode: ViewMode) => {
    setSettings((prev) => ({ ...prev, window: { ...prev.window, viewMode } }));
  }, []);

  // Load lyrics for a song, applying the sync-mode rule (synced → Karaoke,
  // plain-only → Full Sheet). Latest-wins: a superseded request may not apply
  // its result or clear the loading flag.
  const loadLyrics = useCallback(
    async (song: Song, config: typeof aiConfig, useCache = true, startFromIndex = 0) => {
      const { id, signal } = latestRequestRef.current.start();
      setIsLoadingLyrics(true);
      try {
        const data = await fetchLyrics(song, {
          useCache,
          aiConfig: config,
          startFromIndex,
          signal,
        });
        if (!latestRequestRef.current.isCurrent(id)) return;
        if (data) {
          lastProviderIndexRef.current = providerIndexFor(data.provider);
          setLyricsData(data);
          applyAutoViewMode(data.syncedLyrics.length > 0 ? 'karaoke' : 'sheet');
        } else {
          setLyricsData(emptyLyricsData(song));
        }
      } finally {
        if (latestRequestRef.current.isCurrent(id)) setIsLoadingLyrics(false);
      }
    },
    [applyAutoViewMode]
  );

  useEffect(() => () => latestRequestRef.current.cancel(), []);

  const handleThumbsUp = useCallback(() => {
    if (lyricsData.syncedLyrics.length === 0 && !lyricsData.plainLyrics.trim()) return;
    saveAcceptedLyrics(currentSong, lyricsData);
    setFeedbackState('up');
  }, [currentSong, lyricsData]);

  const handleThumbsDown = useCallback(() => {
    const next = lastProviderIndexRef.current + 1;
    setFeedbackState('down');
    void loadLyrics(currentSong, aiConfig, false, next);
  }, [currentSong, aiConfig, loadLyrics]);

  const handleSelectSong = useCallback(
    (song: Song) => {
      setCurrentSong(song);
      setShowHistory(false);
      setHasOverride(false);
      lastProviderIndexRef.current = 0;
      setFeedbackState('none');
      scorerRef.current.reset();
      setLyricsData(emptyLyricsData(song));
      applySnapshot(0, detectionRef.current === 'browser', song.durationMs, false);
      void loadLyrics(song, aiConfig);
    },
    [aiConfig, applySnapshot, loadLyrics]
  );

  const handleResetHistory = useCallback(() => {
    resetHistory();
    setHistoryVersion((prev) => prev + 1);
  }, []);

  // Re-resolve the current track from a corrected metadata pair and re-run the
  // provider lookup, deliberately ignoring the cache.
  const applyMetadata = useCallback(
    (metadata: SanitizedMetadata) => {
      const raw = lastNowPlayingRef.current;
      if (!raw) return;
      const song = resolveDesktopSong(raw, metadata);
      setCurrentSong(song);
      lastProviderIndexRef.current = 0;
      setFeedbackState('none');
      scorerRef.current.reset();
      setLyricsData(emptyLyricsData(song));
      void loadLyrics(song, aiConfig, false);
    },
    [aiConfig, loadLyrics]
  );

  const handleApplyOverride = useCallback(
    (title: string, artist: string) => {
      const key = lastDesktopTrackKeyRef.current;
      if (!key) return;
      setOverride(key, { title, artist });
      setHasOverride(true);
      applyMetadata({ title, artist });
    },
    [applyMetadata]
  );

  const handleRevertOverride = useCallback(() => {
    const key = lastDesktopTrackKeyRef.current;
    if (!key) return;
    removeOverride(key);
    setHasOverride(false);
    const raw = lastNowPlayingRef.current;
    if (!raw) return;
    const metadata = sanitizeMetadata(raw.title, raw.artist);
    if (metadata) applyMetadata(metadata);
  }, [applyMetadata]);

  // Keep the desktop bridge handler bound to the latest config without reconnecting
  useEffect(() => {
    desktopHandlerRef.current = (nowPlaying: NowPlaying) => {
      lastNowPlayingRef.current = nowPlaying;
      isAmazonRef.current = Boolean(nowPlaying.isAmazon);
      setDetectedAppId(nowPlaying.appId ?? null);

      const playing = nowPlaying.isPlaying;
      const positionMs = typeof nowPlaying.positionMs === 'number' ? nowPlaying.positionMs : 0;
      const { durationMs, durationAuthoritative } = resolveDuration(nowPlaying.durationMs);

      const metadata = sanitizeMetadata(nowPlaying.title, nowPlaying.artist);
      if (!playing || !metadata) {
        // Not-ready reading: keep the last good track, just advance the clock.
        applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
        return;
      }

      const detectedKey = trackKey(metadata.title, metadata.artist);
      if (detectedKey !== lastDesktopTrackKeyRef.current) {
        lastDesktopTrackKeyRef.current = detectedKey;
        const override = getOverride(detectedKey);
        setHasOverride(Boolean(override));
        const song = resolveDesktopSong(nowPlaying, override ?? metadata);
        setCurrentSong(song);
        lastProviderIndexRef.current = 0;
        setFeedbackState('none');
        scorerRef.current.reset();
        // Clear to the new song's empty state before fetching so the loading
        // state is visible and no stale lyric can render.
        setLyricsData(emptyLyricsData(song));
        applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
        void loadLyrics(song, aiConfig);
        return;
      }

      applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
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

  // Media Session API sync (browser source)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentSong.title,
          artist: currentSong.artist,
          album: currentSong.album,
          artwork: currentSong.albumArt
            ? [{ src: currentSong.albumArt, sizes: '300x300', type: 'image/jpeg' }]
            : [],
        });
        navigator.mediaSession.setActionHandler('play', () => setPlayingState(true));
        navigator.mediaSession.setActionHandler('pause', () => setPlayingState(false));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) handleSeek(details.seekTime * 1000);
        });
      } catch {
        // Media session unsupported in some restricted iframes
      }
    }
  }, [currentSong, setPlayingState, handleSeek]);

  return (
    <div className="relative w-screen h-screen flex flex-col overflow-hidden bg-[#05070d] text-slate-100">
      <BackgroundBackdrop theme={settings.backgroundTheme} />

      <div className="relative z-10 flex flex-col h-full min-h-0">
        <NowPlayingHeader
          song={currentSong}
          detectionSource={detectionSource}
          isLoading={isLoadingLyrics}
          historyActive={showHistory}
          onToggleHistory={() => setShowHistory((prev) => !prev)}
          appId={detectedAppId}
          hasOverride={hasOverride}
          onEditMetadata={handleApplyOverride}
          onRevertOverride={handleRevertOverride}
          optionsMenu={
            <OptionsMenu
              settings={settings}
              onChange={updateSettings}
              onResetHistory={handleResetHistory}
            />
          }
        />

        <main className="flex-1 min-h-0 overflow-hidden p-4 flex items-start justify-center">
          {showHistory ? (
            <MostListenedPanel key={historyVersion} onSelectSong={handleSelectSong} />
          ) : (
            <LyricsPanel
              lyricsData={lyricsData}
              currentTimeMs={currentTimeMs}
              syncOffsetMs={settings.syncOffsetMs}
              onOffsetChange={(offsetMs) => updateSettings({ syncOffsetMs: offsetMs })}
              windowState={settings.window}
              onUpdateWindowState={(updates) =>
                updateSettings({ window: { ...settings.window, ...updates } })
              }
              onSeek={handleSeek}
              isLoadingLyrics={isLoadingLyrics}
              feedbackState={feedbackState}
              onThumbsUp={handleThumbsUp}
              onThumbsDown={handleThumbsDown}
              layoutWidth={layoutWidthFor(settings.layoutPreset)}
            />
          )}
        </main>
      </div>

      <span
        data-testid="app-version"
        className="pointer-events-none fixed bottom-1 right-2 z-[60] select-none font-mono text-[10px] leading-none tracking-wider text-slate-400/40"
      >
        v{APP_VERSION}
      </span>
    </div>
  );
}
