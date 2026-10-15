import { LyricLine } from '../types/lyrics';

/**
 * Parses raw LRC format string into timestamped LyricLine array
 * e.g. "[00:14.20] Hello from the other side" -> { startTimeMs: 14200, text: "Hello..." }
 */
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\]/g;

  let lineCounter = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    timeRegex.lastIndex = 0;
    const match = timeRegex.exec(trimmed);

    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const msPart = match[3] ? match[3].padEnd(3, '0').slice(0, 3) : '000';
      const milliseconds = parseInt(msPart, 10);
      const startTimeMs = minutes * 60000 + seconds * 1000 + milliseconds;

      const text = trimmed.replace(/\[\d{2}:\d{2}\.?\d{2,3}?\]/g, '').trim();

      if (text) {
        let section: LyricLine['section'] = 'verse';
        const lower = text.toLowerCase();
        if (lower.includes('chorus') || lower.startsWith('[chorus')) section = 'chorus';
        else if (lower.includes('bridge') || lower.startsWith('[bridge')) section = 'bridge';
        else if (lower.includes('intro') || lower.startsWith('[intro')) section = 'intro';
        else if (lower.includes('outro') || lower.startsWith('[outro')) section = 'outro';
        else if (lower.includes('solo') || lower.includes('instrumental')) section = 'instrumental';

        result.push({
          id: `line-${lineCounter++}`,
          startTimeMs,
          text: text.replace(/^\[.*?\]\s*/, ''),
          section,
        });
      }
    }
  }

  return result.sort((a, b) => a.startTimeMs - b.startTimeMs);
}
