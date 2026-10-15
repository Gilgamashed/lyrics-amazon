import { Song } from '../../types/lyrics';
import { parseLrc } from '../lrcParser';
import { LyricsProviderResult } from './types';

export async function fetchLrcLib(song: Song, timeoutMs = 4000): Promise<LyricsProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
      song.title
    )}&artist_name=${encodeURIComponent(song.artist)}&duration=${Math.round(
      song.durationMs / 1000
    )}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return { hasSync: false, provider: 'LRCLIB' };
    const data = await res.json();
    if (data.syncedLyrics) {
      const parsed = parseLrc(data.syncedLyrics);
      if (parsed.length > 0) {
        return {
          syncedLyrics: parsed,
          plainLyrics: data.plainLyrics || parsed.map((l) => l.text).join('\n'),
          hasSync: true,
          provider: 'LRCLIB',
        };
      }
    }
    if (data.plainLyrics) {
      const plain = data.plainLyrics as string;
      return {
        syncedLyrics: undefined,
        plainLyrics: plain,
        hasSync: false,
        provider: 'LRCLIB',
      };
    }
    return { hasSync: false, provider: 'LRCLIB' };
  } catch {
    clearTimeout(timeoutId);
    return { hasSync: false, provider: 'LRCLIB' };
  }
}
