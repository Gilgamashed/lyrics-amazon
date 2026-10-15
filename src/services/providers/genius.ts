import { Song } from '../../types/lyrics';
import { httpFetch } from '../httpClient';
import { normalize } from './base';
import { LyricsProviderResult } from './types';

interface GeniusHit {
  result?: {
    title?: string;
    path?: string;
    primary_artist?: { name?: string };
  };
}

interface GeniusSearchResponse {
  response?: {
    hits?: GeniusHit[];
    sections?: Array<{ hits?: GeniusHit[] }>;
  };
}

const SECTION_RE =
  /\[(?:Intro|Verse|Chorus|Pre-Chorus|Post-Chorus|Bridge|Outro|Refrain|Hook|Instrumental|Interlude|Skit|Spoken)[^\]]*\]/i;

export function extractLyricsFromHtml(html: string): string | null {
  if (!html) return null;
  const blocks = extractLyricsContainers(html)
    .map(decode)
    .map(cleanBlock)
    .filter((block): block is string => block !== null);
  if (blocks.length === 0) return null;
  return blocks.join('\n\n').trim();
}

/**
 * Genius wraps the first lyrics block together with a "Contributors /
 * Translations" widget and the song description ("<Title> Lyrics ... Read
 * More"). When that header is present, drop everything ahead of the first
 * section marker (e.g. `[Verse 1]`). Empty ad-placeholder containers decode to
 * an empty string and are discarded.
 */
function cleanBlock(text: string): string | null {
  if (!text) return null;
  let body = text;
  const marker = SECTION_RE.exec(body);
  if (marker && marker.index > 0) {
    const prefix = body.slice(0, marker.index);
    if (prefix.length > 40 || /contributors|translations|read more/i.test(prefix)) {
      body = body.slice(marker.index);
    }
  }
  const trimmed = body.trim();
  return trimmed.length >= 20 ? trimmed : null;
}

/**
 * Collects the inner HTML of every `data-lyrics-container="true"` element.
 *
 * Genius nests `<div>`/`<a>`/`<span>` inside the lyrics container, so a
 * non-greedy `</div>` match truncates the lyrics. This walks the nesting depth
 * to find the matching close tag for each container instead.
 */
function extractLyricsContainers(html: string): string[] {
  const out: string[] = [];
  const openRe = /data-lyrics-container\s*=\s*"true"/gi;
  const tagRe = /<\/?div\b/gi;
  let match: RegExpExecArray | null;

  while ((match = openRe.exec(html))) {
    const tagEnd = html.indexOf('>', match.index + match[0].length);
    if (tagEnd === -1) break;

    const contentStart = tagEnd + 1;
    tagRe.lastIndex = contentStart;

    let depth = 0;
    let contentEnd = -1;
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(html))) {
      if (tag[0][1] === '/') {
        if (depth === 0) {
          contentEnd = tag.index;
          break;
        }
        depth--;
      } else {
        depth++;
      }
    }
    if (contentEnd === -1) break;

    out.push(html.slice(contentStart, contentEnd));
    openRe.lastIndex = contentEnd;
  }

  return out;
}

function decode(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectHits(payload: GeniusSearchResponse): GeniusHit[] {
  const response = payload?.response;
  if (!response) return [];
  if (Array.isArray(response.hits) && response.hits.length > 0) return response.hits;
  if (Array.isArray(response.sections)) {
    return response.sections.flatMap((section) => section.hits ?? []);
  }
  return response.hits ?? [];
}

export async function fetchGenius(song: Song, timeoutMs = 4000): Promise<LyricsProviderResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'Genius' };
  try {
    const q = encodeURIComponent(`${song.title} ${song.artist}`);
    const searchRes = await httpFetch(`https://genius.com/api/search/song?q=${q}`, {
      signal: controller.signal,
    });
    if (!searchRes.ok) {
      clearTimeout(timeoutId);
      return empty;
    }
    const searchJson = (await searchRes.json()) as GeniusSearchResponse;
    const hits = collectHits(searchJson);
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
    const pageRes = await httpFetch(`https://genius.com${path}`, { signal: controller.signal });
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
