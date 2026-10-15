import { Song } from '../../types/lyrics';
import { normalize } from './base';
import { LyricsProviderResult } from './types';

export function extractLyricsFromHtml(html: string): string | null {
  if (!html) return null;
  const patterns = [
    /<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]+class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  const blocks: string[] = [];
  for (const p of patterns) {
    const matches = html.match(p);
    if (!matches) continue;
    for (const m of matches) {
      const inner = m.replace(/^<div[^>]*>/i, '').replace(/<\/div>$/i, '');
      const decoded = decode(inner);
      if (decoded.length > 20) blocks.push(decoded);
    }
    if (blocks.length > 0) break;
  }
  if (blocks.length === 0) return null;
  return blocks.join('\n\n').trim();
}

function decode(raw: string): string {
  return raw
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
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function fetchGenius(song: Song, timeoutMs = 4000): Promise<LyricsProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'Genius' };
  try {
    const q = encodeURIComponent(`${song.title} ${song.artist}`);
    const searchRes = await fetch(`https://genius.com/api/search/song?q=${q}`, {
      signal: controller.signal,
    });
    if (!searchRes.ok) {
      clearTimeout(timeoutId);
      return empty;
    }
    const searchJson = await searchRes.json();
    const hits = searchJson?.response?.hits || [];
    if (!hits.length) {
      clearTimeout(timeoutId);
      return empty;
    }
    const normTitle = normalize(song.title);
    const normArtist = normalize(song.artist);
    let best = hits[0];
    for (const h of hits) {
      const r = h.result || {};
      const t = normalize(r.title || '');
      const a = normalize(r.primary_artist?.name || '');
      if (
        (t.includes(normTitle) && a.includes(normArtist)) ||
        (normTitle.includes(t) && normArtist.includes(a))
      ) {
        best = h;
        break;
      }
    }
    const path = best.result?.path;
    if (!path) {
      clearTimeout(timeoutId);
      return empty;
    }
    const pageRes = await fetch(`https://genius.com${path}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!pageRes.ok) return empty;
    const html = await pageRes.text();
    const lyrics = extractLyricsFromHtml(html);
    if (!lyrics) return empty;
    return {
      plainLyrics: lyrics,
      syncedLyrics: undefined,
      hasSync: false,
      provider: 'Genius',
    };
  } catch {
    clearTimeout(timeoutId);
    return empty;
  }
}
