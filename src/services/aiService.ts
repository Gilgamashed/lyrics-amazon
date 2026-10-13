import { Song, LyricsData, LyricLine, GeniusAnnotation, AIConfig } from '../types/lyrics';

const DEFAULT_TIMEOUT_MS = 20000;

const ALLOWED_SECTIONS: LyricLine['section'][] = [
  'intro',
  'verse',
  'chorus',
  'bridge',
  'outro',
  'instrumental',
];

interface RawAILine {
  timeMs?: number;
  startTimeMs?: number;
  text?: string;
  section?: string;
}

interface RawAIAnnotation {
  lineRef?: string;
  header?: string;
  content?: string;
}

interface RawAIPayload {
  lines?: RawAILine[];
  annotations?: RawAIAnnotation[];
  trivia?: string[];
}

/**
 * Resolves the active AI configuration.
 * Order: in-app session settings → environment (endpoint + model) → disabled.
 * The API key is never read from the environment; it comes only from the
 * session settings so it is never baked into the client bundle.
 */
export function resolveAIConfig(session?: Partial<AIConfig> | null): AIConfig {
  const env = import.meta.env;
  const providerUrl = (session?.providerUrl || env.VITE_AI_PROVIDER_URL || '').trim();
  const model = (session?.model || env.VITE_AI_MODEL || '').trim();
  const apiKey = (session?.apiKey || '').trim();
  const enabled =
    session?.enabled !== false && Boolean(providerUrl && model && apiKey);

  return { providerUrl, model, apiKey, enabled };
}

export function isAIConfigured(config: AIConfig): boolean {
  return Boolean(
    config.enabled && config.providerUrl.trim() && config.model.trim() && config.apiKey.trim()
  );
}

function buildPrompt(song: Song): string {
  const durationSec = Math.max(1, Math.round(song.durationMs / 1000));
  return [
    `You are a synchronized-lyrics generator for the Amazon Music companion app.`,
    `The user is playing "${song.title}" by ${song.artist} (album: ${song.album}).`,
    `Approximate track duration: ${durationSec} seconds.`,
    ``,
    `Return ONLY a single JSON object (no markdown, no commentary) with this shape:`,
    `{`,
    `  "lines": [ { "timeMs": <integer milliseconds>, "text": "<lyric line>", "section": "<intro|verse|chorus|bridge|outro|instrumental>" } ],`,
    `  "annotations": [ { "lineRef": "<exact lyric text>", "header": "<short title>", "content": "<1-2 sentence explanation>" } ],`,
    `  "trivia": [ "<behind-the-lyrics fact>" ]`,
    `}`,
    ``,
    `Rules: timestamps strictly increasing and within 0..${durationSec * 1000};`,
    `provide 8-24 lines; if you do not know the real lyrics, generate plausible ones that fit the title and mood.`,
    `Include 1-3 annotations whose "lineRef" exactly matches one of the lines, and 1-4 trivia facts.`,
  ].join('\n');
}

function extractJson(content: string): RawAIPayload | null {
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as RawAIPayload;
  } catch {
    return null;
  }
}

function toLyricLines(rawLines: RawAILine[]): LyricLine[] {
  const lines: LyricLine[] = [];
  rawLines.forEach((raw, idx) => {
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!text) return;
    const time = raw.timeMs ?? raw.startTimeMs;
    const startTimeMs = typeof time === 'number' && Number.isFinite(time) && time >= 0 ? Math.round(time) : 0;
    const section =
      typeof raw.section === 'string' && (ALLOWED_SECTIONS as string[]).includes(raw.section)
        ? (raw.section as LyricLine['section'])
        : undefined;
    lines.push({ id: `ai-line-${idx}`, startTimeMs, text, section });
  });

  return lines
    .sort((a, b) => a.startTimeMs - b.startTimeMs)
    .map((line, idx) => ({ ...line, id: `ai-line-${idx}` }));
}

function toAnnotations(rawAnnotations: RawAIAnnotation[] | undefined, lines: LyricLine[]): GeniusAnnotation[] {
  if (!rawAnnotations || rawAnnotations.length === 0) return [];
  const annotations: GeniusAnnotation[] = [];

  rawAnnotations.forEach((raw, idx) => {
    if (typeof raw.content !== 'string' || !raw.content.trim()) return;
    const lineRef = typeof raw.lineRef === 'string' ? raw.lineRef.trim() : '';
    // Only keep annotations that can actually be attached to a lyric line.
    const match = lineRef ? lines.find((l) => l.text === lineRef && !l.annotationId) : undefined;
    if (!match) return;

    const id = `ai-ann-${idx}`;
    match.annotationId = id;
    annotations.push({
      id,
      lineRef: match.text,
      header: (raw.header || 'AI Insight').trim(),
      content: raw.content.trim(),
      verifiedBy: 'AI Synthesized',
    });
  });

  return annotations;
}

/**
 * Synthesizes synchronized lyrics + annotations through an OpenAI-compatible
 * chat/completions endpoint. Returns `null` on any failure so callers can fall
 * back gracefully without blocking playback.
 */
export async function synthesizeLyrics(song: Song, config: AIConfig): Promise<LyricsData | null> {
  if (!isAIConfigured(config) || !song.title.trim()) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${config.providerUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You output strict JSON only.' },
          { role: 'user', content: buildPrompt(song) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const json = await res.json();
    const content: unknown = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;

    const payload = extractJson(content);
    if (!payload || !Array.isArray(payload.lines)) return null;

    const syncedLyrics = toLyricLines(payload.lines);
    if (syncedLyrics.length === 0) return null;

    const annotations = toAnnotations(payload.annotations, syncedLyrics);
    const trivia = Array.isArray(payload.trivia)
      ? payload.trivia.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [];

    return {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumArt: song.albumArt,
      syncedLyrics,
      plainLyrics: syncedLyrics.map((l) => l.text).join('\n'),
      provider: 'AI Sync',
      annotations,
      trivia,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
