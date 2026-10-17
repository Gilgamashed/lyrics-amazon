import { LyricLine, LyricsData, Song } from '../types/lyrics';
import { KaraokeAIConfig, isKaraokeAIConfigured } from './karaokeAIConfigStore';

/** A single time-ranged transcription segment returned by the alignment model. */
export interface AlignmentCue {
  startMs: number;
  endMs: number;
  text: string;
}

export type AlignmentProtocol = 'openai' | 'huggingface';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_LINE_INTERVAL_MS = 4_000;

/**
 * Chooses the request/response protocol from the endpoint URL. A Hugging Face
 * ASR URL targets `/models/{model}` and takes raw audio bytes; everything else
 * is treated as an OpenAI-compatible `audio/transcriptions` multipart endpoint.
 */
export function detectAlignmentProtocol(endpointUrl: string): AlignmentProtocol {
  return endpointUrl.toLowerCase().includes('/models/') ? 'huggingface' : 'openai';
}

/** Resolves the concrete endpoint URL (appending the OpenAI path when needed). */
export function resolveAlignmentUrl(endpointUrl: string): string {
  const base = endpointUrl.trim().replace(/\/+$/, '');
  if (detectAlignmentProtocol(base) === 'huggingface') return base;
  return /\/audio\/transcriptions$/i.test(base) ? base : `${base}/audio/transcriptions`;
}

function toMs(value: number): number {
  return Math.max(0, Math.round(value * 1000));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/** Parses an OpenAI `verbose_json` segment (`start`/`end` in seconds). */
function segmentToCue(raw: unknown): AlignmentCue | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const start = readNumber(record, ['start', 'startTime', 'start_time']);
  const end = readNumber(record, ['end', 'endTime', 'end_time']);
  const text = readString(record, ['text', 'content']);
  if (start === null || !text) return null;
  return { startMs: toMs(start), endMs: toMs(end ?? start), text };
}

/** Parses a Hugging Face ASR chunk (`timestamp: [start, end]` in seconds). */
function chunkToCue(raw: unknown): AlignmentCue | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const text = readString(record, ['text', 'content']);
  const timestamp = record.timestamp;
  if (!text || !Array.isArray(timestamp) || timestamp.length < 1) return null;
  const start = typeof timestamp[0] === 'number' ? timestamp[0] : null;
  if (start === null) return null;
  const end = typeof timestamp[1] === 'number' ? timestamp[1] : start;
  return { startMs: toMs(start), endMs: toMs(end), text };
}

/**
 * Extracts alignment cues from either an OpenAI `verbose_json` response
 * (`segments[]`) or a Hugging Face ASR response (`chunks[]`). Non-matching
 * payloads yield an empty list so the caller can report a clear error.
 */
export function parseAlignmentResponse(payload: unknown): AlignmentCue[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;

  const segments = asArray(record.segments)
    .map(segmentToCue)
    .filter((cue): cue is AlignmentCue => cue !== null);
  if (segments.length > 0) return sortCues(segments);

  const chunks = asArray(record.chunks)
    .map(chunkToCue)
    .filter((cue): cue is AlignmentCue => cue !== null);
  return sortCues(chunks);
}

function sortCues(cues: AlignmentCue[]): AlignmentCue[] {
  return [...cues].sort((a, b) => a.startMs - b.startMs);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Merges the model's cues with the known plain lyric lines into monotonic
 * `LyricLine[]`. Each line is matched to the cue whose normalized text contains
 * (or is contained by) the line; unmatched lines are interpolated between their
 * nearest matched neighbours (or laid out on a fixed interval when no cue
 * matches at all). Pure and deterministic for easy testing.
 */
export function mergeTimestamps(plainLyrics: string, cues: AlignmentCue[]): LyricLine[] {
  const lines = plainLyrics
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const sorted = sortCues(cues);
  const normalizedCues = sorted.map((cue) => normalizeText(cue.text));

  const matched: (number | null)[] = lines.map((line) => {
    const target = normalizeText(line);
    if (!target) return null;
    const found = normalizedCues.findIndex(
      (cue) => cue.length > 0 && (cue.includes(target) || target.includes(cue))
    );
    return found === -1 ? null : sorted[found].startMs;
  });

  const knownIndices = matched
    .map((time, index) => (time === null ? -1 : index))
    .filter((index) => index >= 0);

  const times: number[] = new Array(lines.length).fill(0);

  if (knownIndices.length === 0) {
    const start = sorted.length > 0 ? sorted[0].startMs : 0;
    for (let i = 0; i < lines.length; i += 1) {
      times[i] = start + i * DEFAULT_LINE_INTERVAL_MS;
    }
  } else {
    const firstIndex = knownIndices[0];
    const firstTime = matched[firstIndex] as number;
    const leadInterval =
      firstIndex > 0
        ? Math.max(1, Math.min(DEFAULT_LINE_INTERVAL_MS, Math.round(firstTime / (firstIndex + 1))))
        : 0;
    for (let i = 0; i < firstIndex; i += 1) {
      times[i] = Math.max(0, firstTime - (firstIndex - i) * leadInterval);
    }

    for (let k = 0; k < knownIndices.length; k += 1) {
      const index = knownIndices[k];
      times[index] = matched[index] as number;

      const nextIndex = knownIndices[k + 1];
      if (nextIndex === undefined) continue;
      const startTime = matched[index] as number;
      const endTime = matched[nextIndex] as number;
      const span = Math.max(1, nextIndex - index);
      const step = Math.max(1, (endTime - startTime) / span);
      for (let i = index + 1; i < nextIndex; i += 1) {
        times[i] = Math.round(startTime + (i - index) * step);
      }
    }

    const lastIndex = knownIndices[knownIndices.length - 1];
    const lastTime = matched[lastIndex] as number;
    for (let i = lastIndex + 1; i < lines.length; i += 1) {
      times[i] = lastTime + (i - lastIndex) * DEFAULT_LINE_INTERVAL_MS;
    }
  }

  return lines.map((text, index) => {
    const startTimeMs = times[index];
    const next = index + 1 < lines.length ? times[index + 1] : undefined;
    const endTimeMs =
      next !== undefined && next > startTimeMs ? next : startTimeMs + DEFAULT_LINE_INTERVAL_MS;
    return { id: `ai-sync-${index}`, startTimeMs, endTimeMs, text };
  });
}

function openAIRequest(audio: Blob, config: KaraokeAIConfig): RequestInit {
  const form = new FormData();
  form.append('file', audio, 'audio.wav');
  form.append('model', config.model);
  form.append('response_format', 'verbose_json');
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  };
}

function huggingFaceRequest(audio: Blob, config: KaraokeAIConfig): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'audio/wav',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: audio,
  };
}

/**
 * Posts the captured audio to the configured endpoint and returns the parsed
 * alignment cues. Auto-detects OpenAI vs Hugging Face from the endpoint URL and
 * isolates its own timeout from the caller's cancellation signal.
 */
export async function requestAlignment(
  audio: Blob,
  config: KaraokeAIConfig,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AlignmentCue[]> {
  if (!isKaraokeAIConfigured(config)) {
    throw new Error('Karaoke AI is not configured.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const protocol = detectAlignmentProtocol(config.endpointUrl);
    const init =
      protocol === 'openai'
        ? openAIRequest(audio, config)
        : huggingFaceRequest(audio, config);

    const response = await fetch(resolveAlignmentUrl(config.endpointUrl), {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Alignment request failed (${response.status}).`);
    }
    return parseAlignmentResponse(await response.json());
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/** Convenience wrapper: capture cues then merge them with the known plain lines. */
export async function alignPlainLyrics(
  audio: Blob,
  config: KaraokeAIConfig,
  plainLyrics: string,
  signal?: AbortSignal
): Promise<LyricLine[]> {
  const cues = await requestAlignment(audio, config, signal);
  return mergeTimestamps(plainLyrics, cues);
}

/**
 * Wraps merged AI-synced lines in `LyricsData` labelled as `'AI Sync'` so the
 * permanent store (`aiLyricsStore`) accepts and replays it on future lookups.
 */
export function toKaraokeLyricsData(song: Song, lines: LyricLine[]): LyricsData {
  return {
    songId: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArt: song.albumArt,
    syncedLyrics: lines,
    plainLyrics: lines.map((line) => line.text).join('\n'),
    provider: 'AI Sync',
    annotations: [],
    trivia: [
      'Timing generated locally by aligning the captured audio with the provider lyrics.',
      'Audio was sent only to the alignment endpoint you configured.',
    ],
  };
}
