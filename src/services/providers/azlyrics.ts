import { Song } from '../../types/lyrics';
import { normalize } from './base';
import { LyricsProviderResult } from './types';

export function extractLyrics(html: string): string | null {
  if (!html) return null;
  const startMarker =
    '<!-- Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement. Sorry about that. -->';
  const start = html.indexOf(startMarker);
  if (start === -1) return null;
  const after = html.slice(start + startMarker.length);
  const end = after.indexOf('</div>');
  let block = end === -1 ? after : after.slice(0, end);
  block = block
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
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
  return block.length > 20 ? block : null;
}

export async function fetchAzLyrics(song: Song, timeoutMs = 3500): Promise<LyricsProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'azlyrics' };
  try {
    const artist = normalize(song.artist).replace(/\s+/g, '').toLowerCase();
    const title = normalize(song.title).replace(/\s+/g, '').toLowerCase();
    if (!artist || !title) {
      clearTimeout(timeoutId);
      return empty;
    }
    const url = `https://www.azlyrics.com/lyrics/${artist}/${title}.html`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return empty;
    const html = await res.text();
    const lyrics = extractLyrics(html);
    if (!lyrics) return empty;
    return { plainLyrics: lyrics, hasSync: false, provider: 'azlyrics' };
  } catch {
    clearTimeout(timeoutId);
    return empty;
  }
}
