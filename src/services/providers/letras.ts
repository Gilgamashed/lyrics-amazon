import { Song } from '../../types/lyrics';
import { normalize } from './base';
import { LyricsProviderResult } from './types';

export function extractLyrics(html: string): string | null {
  if (!html) return null;
  const m =
    html.match(/<div[^>]+class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<article[^>]+class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<div[^>]+itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m || !m[1]) return null;
  const lyrics = m[1]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return lyrics.length > 20 ? lyrics : null;
}

export async function fetchLetras(song: Song, timeoutMs = 3500): Promise<LyricsProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'letras.mus.br' };
  try {
    const artist = normalize(song.artist).replace(/\s+/g, '-').toLowerCase();
    const title = normalize(song.title).replace(/\s+/g, '-').toLowerCase();
    if (!artist || !title) {
      clearTimeout(timeoutId);
      return empty;
    }
    const url = `https://www.letras.mus.br/${artist}/${title}/`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return empty;
    const html = await res.text();
    const lyrics = extractLyrics(html);
    if (!lyrics) return empty;
    return { plainLyrics: lyrics, hasSync: false, provider: 'letras.mus.br' };
  } catch {
    clearTimeout(timeoutId);
    return empty;
  }
}
