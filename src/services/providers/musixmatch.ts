import { Song } from '../../types/lyrics';
import { normalize } from './base';
import { LyricsProviderResult } from './types';

export function extractLyrics(html: string): string | null {
  if (!html) return null;
  const spanMatches = html.match(
    /<span[^>]+class="[^"]*lyrics__content[^"]*"[^>]*>([\s\S]*?)<\/span>/gi
  );
  if (spanMatches && spanMatches.length) {
    const combined = spanMatches
      .map((x) => {
        const sm = x.match(/>([\s\S]*?)<\/span>/i);
        return sm ? decode(sm[1]) : '';
      })
      .filter((t) => t.length > 0)
      .join('\n\n');
    if (combined.length > 20) return combined;
  }
  const m2 = html.match(/<div[^>]+class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (m2 && m2[1]) {
    const lyrics = decode(m2[1]);
    if (lyrics.length > 20) return lyrics;
  }
  return null;
}

function decode(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .trim();
}

export async function fetchMusixmatch(song: Song, timeoutMs = 3500): Promise<LyricsProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'musixmatch' };
  try {
    const artist = normalize(song.artist).replace(/\s+/g, '-').toLowerCase();
    const title = normalize(song.title).replace(/\s+/g, '-').toLowerCase();
    if (!artist || !title) {
      clearTimeout(timeoutId);
      return empty;
    }
    const url = `https://www.musixmatch.com/lyrics/${artist}/${title}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return empty;
    const html = await res.text();
    const lyrics = extractLyrics(html);
    if (!lyrics) return empty;
    return { plainLyrics: lyrics, hasSync: false, provider: 'musixmatch' };
  } catch {
    clearTimeout(timeoutId);
    return empty;
  }
}
