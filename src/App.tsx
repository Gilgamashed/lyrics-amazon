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
import {
  PlaySessionScorer,
  mergePlayIdentity,
  recordPlay,
  resetHistory,
} from './services/playHistoryStore';
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
import {
  buildManualLyrics,
  clearManualLyrics,
  getManualLyrics,
  saveManualLyrics,
} from './services/manualLyricsStore';
import {
  ManualSyncSession,
  abortManualSync,
  createManualSyncSession,
  manualSyncToLyricLines,
  pauseManualSync,
  rearmManualSync,
  resumeManualSync,
  stampManualSync,
  startManualSync,
  stepBackManualSync,
  MANUAL_SYNC_SEEK_THRESHOLD_MS,
} from './services/manualSync';
import { removeCachedLyrics } from './services/lyricsCache';
import { identityKey } from './services/textNormalize';
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

  // Manual lyrics (spec 19, W2/W3).
  const [manualEntry, setManualEntry] = useState<LyricsData | null>(null);
  const [isEditingManual, setIsEditingManual] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [syncSession, setSyncSessionState] = useState<ManualSyncSession | null>(null);
  /** While editing or syncing, the auto-view rule must not move the surface. */
  const surfaceLockRef = useRef(false);
  /** The last playback position seen by the bridge (seek detection). */
  const lastSyncPositionRef = useRef<number | null>(null);
  /**
   * A bounded app-side clock override (spec 19, W3). The bridge position is
   * authoritative, so a manual re-arm is kept only for a short window instead
   * of being snapped back by the next poll.
   */
  const seekOverrideRef = useRef<{ positionMs: number; expiresAt: number } | null>(null);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  const applySnapshot = useCallback(
    (positionMs: number, playing: boolean, durationMs: number, durationAuthoritative: boolean) => {
      const override = seekOverrideRef.current;
      if (override && Date.now() < override.expiresAt) {
        // Keep the user's re-arm for the rest of the override window.
        anchorRef.current = {
          ...anchorRef.current,
          positionMs: override.positionMs,
          atMs: Date.now(),
          playing,
          durationMs,
          durationAuthoritative,
        };
        currentTimeMsRef.current = override.positionMs;
        setCurrentTimeMs(override.positionMs);
        return;
      }
      seekOverrideRef.current = null;
      anchorRef.current = { positionMs, atMs: Date.now(), playing, durationMs, durationAuthoritative };
      currentTimeMsRef.current = positionMs;
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
    currentTimeMsRef.current = positionMs;
    setCurrentTimeMs(positionMs);
  }, []);

  const handleSeek = useCallback((timeMs: number) => {
    const anchor = anchorRef.current;
    anchorRef.current = { ...anchor, positionMs: timeMs, atMs: Date.now() };
    currentTimeMsRef.current = timeMs;
    setCurrentTimeMs(timeMs);
    // Keep the manual re-arm alive for a short window (spec 19, W3): the next
    // bridge snapshot would otherwise snap the clock straight back.
    seekOverrideRef.current = { positionMs: timeMs, expiresAt: Date.now() + 2000 };
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const anchor = anchorRef.current;
      if (anchor.playing) {
        const next = nextClockPositionMs(anchor, Date.now());
        currentTimeMsRef.current = next;
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
  const lastDesktopEffectiveKeyRef = useRef<string | null>(null);
  const lastReadingKeyRef = useRef<string | null>(null);
  const lastNowPlayingRef = useRef<NowPlaying | null>(null);
  const desktopHandlerRef = useRef<(nowPlaying: NowPlaying) => void>(() => {});

  const detectionSource: DetectionSource = bridgeStatus === 'connected' ? 'desktop' : 'browser';
  useEffect(() => {
    detectionRef.current = detectionSource;
  }, [detectionSource]);

  const applyAutoViewMode = useCallback((viewMode: ViewMode) => {
    // The manual editor and a running sync session own the surface (spec 19).
    if (surfaceLockRef.current) return;
    setSettings((prev) => ({ ...prev, window: { ...prev.window, viewMode } }));
  }, []);

  // Load lyrics for a song, applying the sync-mode rule (synced → Karaoke,
  // plain-only → Full Sheet). Latest-wins: a superseded request may not apply
  // its result or clear the loading flag.
  const loadLyrics = useCallback(
    async (
      song: Song,
      config: typeof aiConfig,
      options: { useCache?: boolean; startFromIndex?: number; skipManual?: boolean } = {}
    ) => {
      const { useCache = true, startFromIndex = 0, skipManual = false } = options;
      const { id, signal } = latestRequestRef.current.start();
      setIsLoadingLyrics(true);
      try {
        const data = await fetchLyrics(song, {
          useCache,
          aiConfig: config,
          startFromIndex,
          signal,
          skipManual,
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
    void loadLyrics(currentSong, aiConfig, { useCache: false, startFromIndex: next });
  }, [currentSong, aiConfig, loadLyrics]);

  // Retry a failed lookup (spec 17, W3). The cache is bypassed so a stale
  // "not found" cannot be replayed, and the whole provider chain runs again.
  const handleRetryLookup = useCallback(() => {
    debugLog('ui', 'action-retry-lookup', {
      title: currentSong.title,
      artist: currentSong.artist,
      previousOutcome: lookupOutcome,
    });
    void loadLyrics(currentSong, aiConfig, { useCache: false });
  }, [currentSong, aiConfig, loadLyrics, lookupOutcome]);

  // ─── Manual lyrics (spec 19, W2/W3) ──────────────────────────────────
  const songIdentity = identityKey(currentSong.title, currentSong.artist);
  /** Mirror of the sync session so the key handler always sees the latest one. */
  const syncSessionRef = useRef<ManualSyncSession | null>(null);
  /** Mirror of the playback position for the stamp handler. */
  const currentTimeMsRef = useRef(0);
  /** The raw SMTC identity of the current song (the sync abort key). */
  const rawIdentityRef = useRef('');

  const setSyncSession = useCallback((next: ManualSyncSession | null) => {
    syncSessionRef.current = next;
    setSyncSessionState(next);
  }, []);

  // Keep the manual entry in sync with the current song.
  useEffect(() => {
    const entry = getManualLyrics(currentSong);
    setManualEntry(entry);
    if (!entry && settings.window.viewMode === 'manual') {
      setSettings((prev) => ({ ...prev, window: { ...prev.window, viewMode: 'sheet' } }));
    }
  }, [songIdentity]);

  const handleStartEdit = useCallback(() => {
    const song = currentSongRef.current;
    const entry = manualEntry ?? getManualLyrics(song);
    setEditorText(entry?.plainLyrics ?? '');
    surfaceLockRef.current = true;
    setIsEditingManual(true);
    debugLog('manual', 'manual-edit-opened', {
      title: song.title,
      artist: song.artist,
      hasSaved: Boolean(entry),
    });
  }, [manualEntry]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingManual(false);
    surfaceLockRef.current = syncSessionRef.current !== null;
    debugLog('manual', 'manual-edit-cancelled', {});
  }, []);

  const handleSaveEdit = useCallback((text: string) => {
    const song = currentSongRef.current;
    const previous = manualEntry ?? getManualLyrics(song);
    const rebuilt = buildManualLyrics(song, text);
    // Keep the existing timings only while the text itself is unchanged.
    const unchanged = previous?.plainLyrics === rebuilt.plainLyrics;
    const data = buildManualLyrics(song, text, unchanged ? previous?.syncedLyrics : undefined);
    saveManualLyrics(song, data);
    setManualEntry(data);
    setLyricsData(data);
    setIsEditingManual(false);
    surfaceLockRef.current = syncSessionRef.current !== null;
    setSettings((prev) => ({ ...prev, window: { ...prev.window, viewMode: 'manual' } }));
    debugLog('manual', 'manual-saved', {
      title: song.title,
      artist: song.artist,
      lines: data.plainLyrics.split('\n').length,
      keptTimings: unchanged,
    });
  }, [manualEntry]);

  const handleDeleteManual = useCallback(() => {
    const song = currentSongRef.current;
    const confirmed =
      typeof window !== 'undefined' &&
      window.confirm('Delete the saved manual lyrics for this song?');
    if (!confirmed) {
      debugLog('manual', 'manual-delete-cancelled', { title: song.title });
      return;
    }
    clearManualLyrics(song);
    removeCachedLyrics(song);
    setManualEntry(null);
    // The Manual view no longer has content: fall back to the sheet.
    setSettings((prev) => ({ ...prev, window: { ...prev.window, viewMode: 'sheet' } }));
    debugLog('manual', 'manual-deleted', { title: song.title, artist: song.artist });
    void loadLyrics(song, aiConfig, { useCache: false });
  }, [aiConfig, loadLyrics]);

  const handleSkipManual = useCallback(() => {
    const song = currentSongRef.current;
    debugLog('manual', 'manual-skipped', { title: song.title, artist: song.artist });
    // One-shot: this request ignores the manual lyrics, the entry stays.
    void loadLyrics(song, aiConfig, { useCache: false, skipManual: true });
  }, [aiConfig, loadLyrics]);

  // ─── Manual Sync (spec 19, W3) ───────────────────────────────────────
  const handleStartSync = useCallback(() => {
    const song = currentSongRef.current;
    let entry = manualEntry ?? getManualLyrics(song);
    if (!entry) {
      // Seed the manual entry from the lyrics currently on screen.
      const text = lyricsData.plainLyrics;
      if (!text.trim()) return;
      entry = buildManualLyrics(song, text);
      saveManualLyrics(song, entry);
      setManualEntry(entry);
    }
    const session = startManualSync(
      createManualSyncSession(entry.plainLyrics, rawIdentityRef.current)
    );
    setSyncSession(session);
    surfaceLockRef.current = true;
    setIsEditingManual(false);
    setSettings((prev) => ({ ...prev, window: { ...prev.window, viewMode: 'manual' } }));
    debugLog('manual', 'manual-sync-started', {
      lines: session.lines.length,
      rawKey: session.rawKey,
    });
  }, [manualEntry, lyricsData.plainLyrics]);

  const handleStamp = useCallback(() => {
    const session = syncSessionRef.current;
    if (!session || session.state !== 'syncing') return;
    const atMs = currentTimeMsRef.current;
    const next = stampManualSync(session, atMs);
    setSyncSession(next);
    debugLog('manual', 'manual-sync-stamped', {
      pointer: next.pointer,
      atMs: Math.round(atMs),
    });
  }, [setSyncSession]);

  const handleStepBack = useCallback(() => {
    const session = syncSessionRef.current;
    if (!session) return;
    const next = stepBackManualSync(session);
    setSyncSession(next);
    if (next.rearmAtMs !== null && next.rearmAtMs !== session.rearmAtMs) {
      // App-side re-arm: the external player is not controllable (spec 19).
      handleSeek(next.rearmAtMs);
      debugLog('manual', 'manual-sync-rearmed', { atMs: next.rearmAtMs });
    }
  }, [handleSeek, setSyncSession]);

  const handleCancelSync = useCallback(() => {
    const session = syncSessionRef.current;
    if (session) setSyncSession(abortManualSync(session));
    surfaceLockRef.current = false;
    debugLog('manual', 'manual-sync-cancelled', {});
  }, [setSyncSession]);

  const handleSaveSync = useCallback(() => {
    const session = syncSessionRef.current;
    const song = currentSongRef.current;
    if (!session) return;
    const lines = manualSyncToLyricLines(session);
    const text = session.lines.map((line) => line.text).join('\n');
    const data = buildManualLyrics(song, text, lines);
    saveManualLyrics(song, data);
    setManualEntry(data);
    setLyricsData(data);
    setSyncSession(null);
    surfaceLockRef.current = false;
    debugLog('manual', 'manual-sync-saved', {
      title: song.title,
      lines: lines.length,
    });
  }, [setSyncSession]);

  /** Playback/session signals -> state transitions (spec 19, W3). */
  const handleSyncSignals = useCallback(
    (rawKey: string, playing: boolean, positionMs: number) => {
      const session = syncSessionRef.current;
      const previousPosition = lastSyncPositionRef.current;
      lastSyncPositionRef.current = positionMs;
      if (!session) return;

      if (session.rawKey !== rawKey) {
        // The song changed: absolute abort (spec 19, W3).
        setSyncSession(abortManualSync(session));
        surfaceLockRef.current = false;
        debugLog('manual', 'manual-sync-aborted', { reason: 'song-changed' });
        return;
      }
      if (!playing && session.state === 'syncing') {
        setSyncSession(pauseManualSync(session));
        debugLog('manual', 'manual-sync-paused', { reason: 'playback-paused' });
        return;
      }
      if (
        previousPosition !== null &&
        Math.abs(positionMs - previousPosition) > MANUAL_SYNC_SEEK_THRESHOLD_MS
      ) {
        setSyncSession(rearmManualSync(pauseManualSync(session), positionMs));
        debugLog('manual', 'manual-sync-paused', { reason: 'seek' });
        return;
      }
      if (playing && session.state === 'paused') {
        setSyncSession(resumeManualSync(rearmManualSync(session, positionMs)));
        debugLog('manual', 'manual-sync-resumed', {});
      }
    },
    [setSyncSession]
  );

  // Sync keys are only live while a session is syncing.
  useEffect(() => {
    if (!syncSession || syncSession.state !== 'syncing') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.key === 'ArrowDown') {
        event.preventDefault();
        handleStamp();
      } else if (event.key === 'Backspace' || event.key === 'ArrowUp') {
        event.preventDefault();
        handleStepBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [syncSession, handleStamp, handleStepBack]);

  // Losing the window focus pauses the session so no orphan keypress lands.
  useEffect(() => {
    const onBlur = () => {
      const session = syncSessionRef.current;
      if (!session || session.state !== 'syncing') return;
      setSyncSession(pauseManualSync(session));
      debugLog('manual', 'manual-sync-paused', { reason: 'window-blur' });
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [setSyncSession]);

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
      lastDesktopEffectiveKeyRef.current = trackKey(
        metadata.title || metadata.artist,
        metadata.artist
      );
      setCurrentSong(song);
      lastProviderIndexRef.current = 0;
      setFeedbackState('none');
      scorerRef.current.reset();
      setLyricsData(emptyLyricsData(song));
      void loadLyrics(song, aiConfig, { useCache: false });
    },
    [aiConfig, loadLyrics]
  );

  /**
   * Applies a UIA enrichment for the same raw SMTC reading. This is a metadata
   * refinement, not a new track: the play session/scorer is deliberately not
   * reset, and an already-recorded Unknown Artist play is migrated to the
   * recovered identity.
   */
  const applyUiaEnrichment = useCallback(
    (metadata: SanitizedMetadata) => {
      const raw = lastNowPlayingRef.current;
      if (!raw) return;
      const previous = currentSongRef.current;
      const song = resolveDesktopSong(raw, metadata);
      lastDesktopEffectiveKeyRef.current = trackKey(
        metadata.title || metadata.artist,
        metadata.artist
      );
      setCurrentSong(song);
      lastProviderIndexRef.current = 0;
      setFeedbackState('none');
      setLookupOutcome(undefined);
      setLyricsData(emptyLyricsData(song));
      void loadLyrics(song, aiConfig);
      mergePlayIdentity(previous, song, 'amazon');
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

      const rawTitle = nowPlaying.sourceTitle ?? nowPlaying.title;
      const rawArtist = nowPlaying.sourceArtist ?? nowPlaying.artist;
      const rawInspection = inspectMetadata(rawTitle, rawArtist);
      const effectiveInspection = inspectMetadata(nowPlaying.title, nowPlaying.artist);
      const metadataSource = nowPlaying.metadataSource;
      const uiaAttempt = nowPlaying.uiaAttempt;

      // The bridge republishes every poll tick; only report a decision when it
      // actually changes so the terminal stays readable.
      const decisionKey = [
        rawInspection.status,
        rawInspection.title,
        rawInspection.artist,
        effectiveInspection.status,
        effectiveInspection.title,
        effectiveInspection.artist,
        metadataSource ?? '',
        uiaAttempt ?? '',
      ].join('|');
      if (decisionKey !== lastReadingKeyRef.current) {
        lastReadingKeyRef.current = decisionKey;
        const uiaEnriched = metadataSource === 'smtc+uia';
        debugLog(
          'metadata',
          uiaEnriched
            ? 'reading-uia-enriched'
            : rawInspection.status === 'empty-reading'
              ? 'reading-empty-kept-previous'
              : rawInspection.titleMissing
                ? 'reading-adopted-missing-title'
                : rawInspection.status === 'duplicate'
                  ? 'reading-adopted-title-only'
                  : 'reading-accepted',
          {
            rawTitle,
            rawArtist,
            rawAlbum: nowPlaying.album,
            effectiveTitle: nowPlaying.title,
            effectiveArtist: nowPlaying.artist,
            durationMs: nowPlaying.durationMs,
            playing,
            status: rawInspection.status,
            title: rawInspection.ok ? rawInspection.title : undefined,
            artist: rawInspection.ok ? rawInspection.artist : undefined,
            splitFrom: rawInspection.splitFrom,
            reason: rawInspection.ok ? undefined : rawInspection.reason,
            metadataSource,
            uiaAttempt,
          },
          rawInspection.ok ? (rawInspection.titleMissing ? 'warn' : 'info') : 'warn'
        );
      }

      if (!playing) {
        applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
        return;
      }

      const rawMetadata: SanitizedMetadata | null = rawInspection.ok
        ? {
            title: rawInspection.title,
            artist: rawInspection.artist,
            titleMissing: rawInspection.titleMissing,
            splitFrom: rawInspection.splitFrom,
            status: rawInspection.status,
          }
        : null;
      const effectiveMetadata: SanitizedMetadata | null = effectiveInspection.ok
        ? {
            title: effectiveInspection.title,
            artist: effectiveInspection.artist,
            titleMissing: effectiveInspection.titleMissing,
            splitFrom: effectiveInspection.splitFrom,
            status: effectiveInspection.status,
          }
        : null;

      const rawKey = rawMetadata
        ? trackKey(rawMetadata.title || rawMetadata.artist, rawMetadata.artist)
        : trackKey(rawTitle ?? '', rawArtist ?? '');

      // The sync session watches the raw identity, the play state and the
      // position (spec 19, W3).
      rawIdentityRef.current = rawKey;
      handleSyncSignals(rawKey, playing, positionMs);

      // A manual correction is authoritative and must be looked up against the
      // *raw* identity, before UIA or artist memory can rewrite the title.
      const override = getOverride(
        rawMetadata
          ? rawMetadata.title || rawMetadata.artist
          : rawTitle || rawArtist || '',
        rawMetadata ? rawMetadata.artist : rawArtist ?? ''
      );

      let metadata: SanitizedMetadata | null = null;
      if (override) {
        metadata = {
          title: override.title,
          artist: override.artist,
          titleMissing: false,
          splitFrom: rawMetadata?.splitFrom,
          status: rawMetadata?.status ?? 'ok',
        };
      } else if (metadataSource === 'smtc+uia' && effectiveMetadata) {
        // UIA outranks the artist memory but never a manual Fix.
        metadata = effectiveMetadata;
      } else if (rawMetadata) {
        metadata = rawMetadata;
        // Artist-scoped memory only fills a missing title when neither the
        // manual Fix nor UIA has already resolved it.
        if (metadata.titleMissing && metadata.artist) {
          const remembered = getArtistTitle(metadata.artist);
          if (remembered) {
            metadata = { ...metadata, title: remembered, titleMissing: false };
            debugLog('metadata', 'artist-title-recalled', {
              artist: metadata.artist,
              title: remembered,
            });
          }
        }
      }

      if (!metadata) {
        // A genuinely empty raw reading with no UIA result keeps the last track.
        applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
        return;
      }

      const effectiveKey = trackKey(metadata.title || metadata.artist, metadata.artist);
      const rawChanged = rawKey !== lastDesktopRawKeyRef.current;
      const effectiveChanged = effectiveKey !== lastDesktopEffectiveKeyRef.current;

      if (!rawChanged && !effectiveChanged) {
        applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
        return;
      }

      if (rawChanged) {
        lastDesktopRawKeyRef.current = rawKey;
        lastDesktopEffectiveKeyRef.current = effectiveKey;
        setHasOverride(Boolean(override));
        debugLog('detection', 'track-changed', {
          rawKey,
          key: effectiveKey,
          title: metadata.title || '',
          artist: metadata.artist,
          album: nowPlaying.album,
          durationMs,
          hasOverride: Boolean(override),
          metadataSource,
          uiaAttempt,
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
      }

      // Same raw reading, new effective metadata. Only UIA enrichment is
      // allowed here; a manual Fix/Revert updates the current song in place
      // and has already set the effective key.
      lastDesktopEffectiveKeyRef.current = effectiveKey;
      setHasOverride(Boolean(override));
      debugLog('detection', 'uia-metadata-enriched', {
        rawKey,
        key: effectiveKey,
        title: metadata.title || '',
        artist: metadata.artist,
        metadataSource,
        uiaAttempt,
      });
      if (metadataSource === 'smtc+uia' && !override) {
        applyUiaEnrichment(metadata);
      } else {
        applySnapshot(positionMs, playing, durationMs, durationAuthoritative);
      }
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
              hasManualLyrics={manualEntry !== null}
              manualEntry={manualEntry}
              isEditing={isEditingManual}
              editorText={editorText}
              onStartEdit={handleStartEdit}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onDeleteManual={handleDeleteManual}
              onSkipManual={handleSkipManual}
              syncSession={syncSession}
              onStartSync={handleStartSync}
              onCancelSync={handleCancelSync}
              onSaveSync={handleSaveSync}
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
