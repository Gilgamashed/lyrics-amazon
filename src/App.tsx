import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Song,
  LyricsData,
  AppSettings,
  NowPlaying,
  DetectionSource,
  FeedbackState,
  ViewMode,
  KaraokeAIStatus,
} from './types/lyrics';
import { fetchLyrics } from './services/lyricsService';
import { DEFAULT_PROVIDER_ORDER } from './services/providers/chain';
import { resolveAIConfig } from './services/aiService';
import { saveAcceptedLyrics } from './services/userLyricsStore';
import { saveAILyrics } from './services/aiLyricsStore';
import { capturePlayback, DEFAULT_CAPTURE_MS } from './services/captureService';
import { alignPlainLyrics, toKaraokeLyricsData } from './services/karaokeAlignService';
import {
  KaraokeAIConfig,
  isKaraokeAIConfigured,
  loadKaraokeAIConfig,
  saveKaraokeAIConfig,
} from './services/karaokeAIConfigStore';
import { createBridgeClient, BridgeConnectionState } from './services/bridgeService';
import { loadSettings, saveSettings } from './services/settingsStore';
import { PlaySessionScorer, recordPlay, resetHistory } from './services/playHistoryStore';
import { layoutWidthFor } from './services/layoutPresets';
import {
  nextClockPositionMs,
  resolveDuration,
  ClockAnchor,
} from './services/playbackClock';
import { sanitizeMetadata, inspectMetadata, SanitizedMetadata } from './services/metadataSanitizer';
import { getOverride, setOverride, removeOverride, trackKey } from './services/metaOverrideStore';
import {
  forgetArtistTitle,
  getArtistTitle,
  rememberArtistTitle,
} from './services/artistTitleMemory';
import { LatestRequest } from './services/latestRequest';
import { LookupOutcome } from './services/lookupOutcome';
import { debugLog, isDebugConsoleEnabled } from './services/debugConsole';
import { NowPlayingHeader } from './components/NowPlayingHeader';
import { LyricsPanel } from './components/LyricsPanel';
import { MostListenedPanel } from './components/MostListenedPanel';
import { BackgroundBackdrop } from './components/BackgroundBackdrop';
import { OptionsMenu } from './components/OptionsMenu';
import { DebugTerminal } from './components/DebugTerminal';
import { APP_VERSION } from './appVersion';

const PROVIDER_ORDER: LyricsData['provider'][] = [...DEFAULT_PROVIDER_ORDER];

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
    id: `desktop-${slug(title || artist || 'unknown')}-${slug(artist)}`,
    // The real title is kept (it may be empty): the provider query must never
    // carry a display placeholder (spec 17, W4).
    title,
    artist,
    album: nowPlaying.album?.trim() || 'Amazon Music',
    albumArt: nowPlaying.albumArt ?? '',
    durationMs,
    amazonMusicUrl: `https://music.amazon.com/search/${encodeURIComponent(
      `${title || artist} ${artist}`.trim()
    )}`,
    genre: 'Now Playing (Desktop)',
    // The player did not report a usable title (spec 17, W2).
    titleMissing: metadata.titleMissing,
    // The original "Artist - Title" blob this identity was split from, so the
    // lookup can also try the reversed pairing (spec 17, W4).
    splitFrom: metadata.splitFrom,
  };
}

export default function App() {
  const [currentSong, setCurrentSong] = useState<Song>(IDLE_SONG);
  const [lyricsData, setLyricsData] = useState<LyricsData>(() => emptyLyricsData(IDLE_SONG));
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('none');
  // How the last lookup ended (spec 17, W3). A transient provider failure is
  // shown with a Retry action instead of "lyrics not found".
  const [lookupOutcome, setLookupOutcome] = useState<LookupOutcome | undefined>(undefined);
  const lastProviderIndexRef = useRef(0);
  const latestRequestRef = useRef(new LatestRequest());

  // Session-only AI fallback config (used silently; no longer surfaced in the UI)
  const [aiConfig] = useState(() => resolveAIConfig());

  // User-triggered AI karaoke pipeline (capture → align → save)
  const [karaokeAIConfig, setKaraokeAIConfig] = useState<KaraokeAIConfig>(() =>
    loadKaraokeAIConfig()
  );
  const [karaokeAIStatus, setKaraokeAIStatus] = useState<KaraokeAIStatus>('idle');
  const [karaokeAIMessage, setKaraokeAIMessage] = useState<string | undefined>(undefined);
  const karaokeAbortRef = useRef<AbortController | null>(null);

  const updateKaraokeAIConfig = useCallback((updates: Partial<KaraokeAIConfig>) => {
    setKaraokeAIConfig(saveKaraokeAIConfig(updates));
  }, []);

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

  // In-app debug terminal (spec 17). Only available in dev and release
  // candidate builds; stable builds never expose it.
  const debugAvailable = isDebugConsoleEnabled();
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (!debugAvailable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey) return;
      if (event.key !== 'D' && event.key !== 'd') return;
      event.preventDefault();
      setDebugOpen((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [debugAvailable]);

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
  // The raw bridge identity last adopted. Manual fixes/reverts update the song
  // in place, so a poll tick with the same raw identity must not re-process it
  // (or undo a missing-title fix).
  const lastDesktopRawKeyRef = useRef<string | null>(null);
  const lastReadingKeyRef = useRef<string | null>(null);
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
          onOutcome: (outcome) => {
            if (latestRequestRef.current.isCurrent(id)) setLookupOutcome(outcome);
          },
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
  useEffect(() => () => karaokeAbortRef.current?.abort(), []);

  const handleThumbsUp = useCallback(() => {
    if (lyricsData.syncedLyrics.length === 0 && !lyricsData.plainLyrics.trim()) return;
    saveAcceptedLyrics(currentSong, lyricsData);
    setFeedbackState('up');
    debugLog('ui', 'action-thumbs-up', {
      title: currentSong.title,
      artist: currentSong.artist,
      provider: lyricsData.provider,
    });
  }, [currentSong, lyricsData]);

  const handleThumbsDown = useCallback(() => {
    const next = lastProviderIndexRef.current + 1;
    setFeedbackState('down');
    debugLog('ui', 'action-thumbs-down', {
      title: currentSong.title,
      artist: currentSong.artist,
      nextProviderIndex: next,
    });
    void loadLyrics(currentSong, aiConfig, false, next);
  }, [currentSong, aiConfig, loadLyrics]);

  // Retry a failed lookup (spec 17, W3). The cache is bypassed so a stale
  // "not found" cannot be replayed, and the whole provider chain runs again.
  const handleRetryLookup = useCallback(() => {
    debugLog('ui', 'action-retry-lookup', {
      title: currentSong.title,
      artist: currentSong.artist,
      previousOutcome: lookupOutcome,
    });
    void loadLyrics(currentSong, aiConfig, false);
  }, [currentSong, aiConfig, loadLyrics, lookupOutcome]);

  // Capture the current playback, align it against the known plain lyrics, and
  // persist the merged result so it wins future lookups for this song.
  const handleGenerateKaraoke = useCallback(async () => {
    if (lyricsData.syncedLyrics.length > 0) return;
    const plainLyrics = lyricsData.plainLyrics.trim();
    if (!plainLyrics) return;

    if (!isKaraokeAIConfigured(karaokeAIConfig)) {
      setKaraokeAIStatus('error');
      setKaraokeAIMessage('Set the Karaoke AI endpoint, model and key in Options first.');
      return;
    }

    karaokeAbortRef.current?.abort();
    const controller = new AbortController();
    karaokeAbortRef.current = controller;

    setKaraokeAIStatus('capturing');
    setKaraokeAIMessage('Recording system audio\u2026');
    try {
      const audio = await capturePlayback(DEFAULT_CAPTURE_MS, controller.signal);
      if (controller.signal.aborted) return;

      setKaraokeAIStatus('aligning');
      setKaraokeAIMessage('Aligning lyrics with the captured audio\u2026');
      const lines = await alignPlainLyrics(audio, karaokeAIConfig, plainLyrics, controller.signal);
      if (controller.signal.aborted) return;

      if (lines.length === 0) {
        setKaraokeAIStatus('error');
        setKaraokeAIMessage('The alignment service returned no timings.');
        return;
      }

      setKaraokeAIStatus('saving');
      setKaraokeAIMessage('Saving synced lyrics\u2026');
      const data = toKaraokeLyricsData(currentSong, lines);
      saveAILyrics(currentSong, data);
      setLyricsData(data);
      lastProviderIndexRef.current = providerIndexFor('AI Sync');
      applyAutoViewMode('karaoke');
      setKaraokeAIStatus('done');
      setKaraokeAIMessage('Karaoke generated and saved. It will be reused next time.');
    } catch (error) {
      if (controller.signal.aborted) {
        setKaraokeAIStatus('idle');
        setKaraokeAIMessage(undefined);
        return;
      }
      setKaraokeAIStatus('error');
      setKaraokeAIMessage(
        error instanceof Error ? error.message : 'Karaoke generation failed.'
      );
    } finally {
      if (karaokeAbortRef.current === controller) karaokeAbortRef.current = null;
    }
  }, [currentSong, karaokeAIConfig, lyricsData.plainLyrics, lyricsData.syncedLyrics.length, applyAutoViewMode]);

  const handleCancelKaraoke = useCallback(() => {
    karaokeAbortRef.current?.abort();
    karaokeAbortRef.current = null;
    setKaraokeAIStatus('idle');
    setKaraokeAIMessage(undefined);
  }, []);

  // Reset AI karaoke progress whenever the track changes, aborting any capture.
  useEffect(() => {
    karaokeAbortRef.current?.abort();
    karaokeAbortRef.current = null;
    setKaraokeAIStatus('idle');
    setKaraokeAIMessage(undefined);
  }, [currentSong.id]);

  const handleSelectSong = useCallback(
    (song: Song) => {
      // A manual fix applies to history re-selection too (spec 16 §3.3).
      const override = getOverride(song.title, song.artist);
      const resolved = override
        ? { ...song, title: override.title, artist: override.artist }
        : song;
      setCurrentSong(resolved);
      setShowHistory(false);
      setHasOverride(false);
      lastProviderIndexRef.current = 0;
      setFeedbackState('none');
      scorerRef.current.reset();
      setLyricsData(emptyLyricsData(resolved));
      applySnapshot(0, detectionRef.current === 'browser', resolved.durationMs, false);
      void loadLyrics(resolved, aiConfig);
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
      const raw = lastNowPlayingRef.current;
      if (!raw) return;
      const detected = sanitizeMetadata(raw.title, raw.artist);
      if (!detected) {
        // A genuinely empty reading has no identity to key an override on, but
        // the user's fix must still be able to run the search (spec 17, W2).
        const rawEmpty = !(raw.title ?? '').trim() && !(raw.artist ?? '').trim();
        if (rawEmpty && title.trim()) {
          debugLog('override', 'override-applied-from-empty-reading', {
            rawTitle: raw.title,
            rawArtist: raw.artist,
            title,
            artist,
          });
          if (artist && title) {
            rememberArtistTitle(artist, title);
          }
          setHasOverride(false);
          applyMetadata({ title, artist, titleMissing: false });
          return;
        }
        debugLog('override', 'override-rejected', {
          rawTitle: raw.title,
          rawArtist: raw.artist,
          title,
          artist,
        }, 'warn');
        return;
      }
      setOverride(detected.title || detected.artist, detected.artist, { title, artist });
      setHasOverride(true);
      // The user's latest fix supersedes any remembered title for the raw
      // artist; remember the confirmed artist -> title pair.
      forgetArtistTitle(detected.artist);
      if (artist && title) {
        rememberArtistTitle(artist, title);
      }
      debugLog('override', 'override-applied', {
        detected: `${detected.title || '(missing)'} | ${detected.artist}`,
        applied: `${title} | ${artist}`,
      });
      applyMetadata({ title, artist, titleMissing: false });
    },
    [applyMetadata]
  );

  const handleRevertOverride = useCallback(() => {
    const raw = lastNowPlayingRef.current;
    if (!raw) return;
    const detected = sanitizeMetadata(raw.title, raw.artist);
    if (!detected) {
      debugLog('override', 'override-revert-failed', {
        rawTitle: raw.title,
        rawArtist: raw.artist,
      }, 'warn');
      return;
    }
    removeOverride(detected.title || detected.artist, detected.artist);
    // A remembered title would silently re-apply the fix on the next poll
    // tick; forgetting it is what makes Revert stick (spec 17, W2).
    forgetArtistTitle(detected.artist);
    forgetArtistTitle(currentSong.artist);
    setHasOverride(false);
    debugLog('override', 'override-reverted', {
      detected: `${detected.title || '(missing)'} | ${detected.artist}`,
    });
    applyMetadata(detected);
  }, [applyMetadata, currentSong.artist]);

  // Keep the desktop bridge handler bound to the latest config without reconnecting
  useEffect(() => {
    desktopHandlerRef.current = (nowPlaying: NowPlaying) => {
      lastNowPlayingRef.current = nowPlaying;
      isAmazonRef.current = Boolean(nowPlaying.isAmazon);
      setDetectedAppId(nowPlaying.appId ?? null);

      const playing = nowPlaying.isPlaying;
      const positionMs = typeof nowPlaying.positionMs === 'number' ? nowPlaying.positionMs : 0;
      const { durationMs, durationAuthoritative } = resolveDuration(nowPlaying.durationMs);

      const inspection = inspectMetadata(nowPlaying.title, nowPlaying.artist);
      // The bridge republishes every poll tick; only report a decision when it
      // actually changes so the terminal stays readable.
      const decisionKey = `${inspection.status}|${inspection.title}|${inspection.artist}`;
      if (decisionKey !== lastReadingKeyRef.current) {
        lastReadingKeyRef.current = decisionKey;
        debugLog(
          'metadata',
          inspection.status === 'empty-reading'
            ? 'reading-empty-kept-previous'
            : inspection.titleMissing
              ? 'reading-adopted-missing-title'
              : inspection.status === 'duplicate'
                ? 'reading-adopted-title-only'
                : 'reading-accepted',
          {
            rawTitle: nowPlaying.title,
            rawArtist: nowPlaying.artist,
            rawAlbum: nowPlaying.album,
            durationMs: nowPlaying.durationMs,
            playing,
            status: inspection.status,
            title: inspection.ok ? inspection.title : undefined,
            artist: inspection.ok ? inspection.artist : undefined,
            splitFrom: inspection.splitFrom,
            reason: inspection.ok ? undefined : inspection.reason,
          },
          inspection.ok ? (inspection.titleMissing ? 'warn' : 'info') : 'warn'
        );
      }

      const detectedMetadata: SanitizedMetadata | null = inspection.ok
        ? {
            title: inspection.title,
            artist: inspection.artist,
            titleMissing: inspection.titleMissing,
            splitFrom: inspection.splitFrom,
            status: inspection.status,
          }
        : null;

      if (!playing || !detectedMetadata) {
        // Not-ready reading: keep the last good track, just advance the clock.
        applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
        return;
      }

      const rawKey = trackKey(
        detectedMetadata.title || detectedMetadata.artist,
        detectedMetadata.artist
      );
      // The bridge republishes on every poll tick; only a new raw identity is a
      // track change. A manual fix/revert updates the current song in place.
      if (rawKey === lastDesktopRawKeyRef.current) {
        applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
        return;
      }
      lastDesktopRawKeyRef.current = rawKey;

      // A manual correction is authoritative and must be looked up against the
      // *raw* identity, before the artist memory can rewrite the title.
      const override = getOverride(
        detectedMetadata.title || detectedMetadata.artist,
        detectedMetadata.artist
      );
      let metadata: SanitizedMetadata = override
        ? {
            ...detectedMetadata,
            title: override.title,
            artist: override.artist,
            titleMissing: false,
          }
        : detectedMetadata;

      // Artist-scoped memory only fills a missing title when the user has not
      // already fixed this track.
      if (!override && metadata.titleMissing && metadata.artist) {
        const remembered = getArtistTitle(metadata.artist);
        if (remembered) {
          metadata = { ...metadata, title: remembered, titleMissing: false };
          debugLog('metadata', 'artist-title-recalled', {
            artist: metadata.artist,
            title: remembered,
          });
        }
      }

      const effectiveKey = trackKey(metadata.title || metadata.artist, metadata.artist);
      setHasOverride(Boolean(override));
      debugLog('detection', 'track-changed', {
        rawKey,
        key: effectiveKey,
        title: metadata.title || '',
        artist: metadata.artist,
        album: nowPlaying.album,
        durationMs,
        hasOverride: Boolean(override),
      });
      const song = resolveDesktopSong(nowPlaying, metadata);
      setCurrentSong(song);
      lastProviderIndexRef.current = 0;
      setFeedbackState('none');
      // The previous track's verdict must not leak into the new one.
      setLookupOutcome(undefined);
      scorerRef.current.reset();
      // Clear to the new song's empty state before fetching so the loading
      // state is visible and no stale lyric can render.
      setLyricsData(emptyLyricsData(song));
      applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
      void loadLyrics(song, aiConfig);
      return;
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
              karaokeAIConfig={karaokeAIConfig}
              onKaraokeAIConfigChange={updateKaraokeAIConfig}
              onOpenDebug={debugAvailable ? () => setDebugOpen(true) : undefined}
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
              onGenerateKaraoke={handleGenerateKaraoke}
              onCancelKaraoke={handleCancelKaraoke}
              karaokeAIStatus={karaokeAIStatus}
              karaokeAIMessage={karaokeAIMessage}
              karaokeAIConfigured={isKaraokeAIConfigured(karaokeAIConfig)}
              lookupOutcome={lookupOutcome}
              onRetryLookup={handleRetryLookup}
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

      {debugAvailable && (
        <DebugTerminal open={debugOpen} onClose={() => setDebugOpen(false)} />
      )}
    </div>
  );
}
