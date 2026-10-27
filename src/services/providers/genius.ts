import { Song } from '../../types/lyrics';
import { evaluateIdentityGate, identityScore } from '../matchScore';
import { buildQueryVariants, LookupIdentity } from '../queryVariants';
import { fetchWithRetry } from '../httpRetry';
import { debugLog } from '../debugConsole';
import { withTimeoutSignal } from './base';
import { LyricsProviderResult } from './types';

export interface GeniusHit {
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

export function collectHits(payload: GeniusSearchResponse): GeniusHit[] {
  const response = payload?.response;
  if (!response) return [];
  if (Array.isArray(response.hits) && response.hits.length > 0) return response.hits;
  if (Array.isArray(response.sections)) {
    return response.sections.flatMap((section) => section.hits ?? []);
  }
  return response.hits ?? [];
}

/**
 * Selects the best-matching hit: only identity-gate-passing candidates are
 * considered and the highest similarity wins. No hit passing the gate means
 * no result (the chain degrades instead of scraping the wrong song).
 *
 * `identity` overrides the identity the candidates are matched against, so a
 * query variant can be gated against its own title/artist pair.
 */
export function pickBestHit(
  hits: GeniusHit[],
  song: Song,
  identity?: LookupIdentity
): GeniusHit | null {
  const gateTitle = identity?.title ?? song.title;
  const gateArtist = identity?.artist ?? song.artist;
  let best: GeniusHit | null = null;
  let bestScore = -1;
  const rejected: Array<{
    title: string;
    artist: string;
    rejection?: string;
    titleScore: number | null;
    artistScore: number | null;
  }> = [];

  for (const h of hits) {
    const r = h.result || {};
    const gate = evaluateIdentityGate(
      r.title || '',
      r.primary_artist?.name || '',
      gateTitle,
      gateArtist
    );
    if (!gate.passed) {
      rejected.push({
        title: r.title || '',
        artist: r.primary_artist?.name || '',
        rejection: gate.rejection,
        titleScore: gate.titleScore === null ? null : Number(gate.titleScore.toFixed(3)),
        artistScore: gate.artistScore === null ? null : Number(gate.artistScore.toFixed(3)),
      });
      continue;
    }
    // The gate only scores the identities the query variant enforces, so the
    // ranking must not score the others either: a title-only variant has to
    // pick the closest *title*, not the first candidate that passed the gate.
    const score = identityScore(gate.titleScore, gate.artistScore);
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }

  if (rejected.length > 0) {
    debugLog('gate', 'genius.candidate-rejected', {
      query: `${song.title} ${song.artist}`,
      candidates: hits.length,
      rejected,
    }, 'warn');
  }

  return best;
}

export async function fetchGenius(
  song: Song,
  timeoutMs = 4000,
  externalSignal?: AbortSignal
): Promise<LyricsProviderResult> {
  const { signal, cleanup } = withTimeoutSignal(timeoutMs, externalSignal);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'Genius', outcome: 'not-found' };
  try {
    const variants = buildQueryVariants(song);
    if (variants.length === 0) {
      cleanup();
      debugLog(
        'provider',
        'genius.result',
        { provider: 'Genius', outcome: 'not-found', reason: 'no-query' },
        'warn'
      );
      return empty;
    }

    let sawGateRejection = false;
    for (const variant of variants) {
      const searchUrl = `https://genius.com/api/search/song?q=${encodeURIComponent(
        variant.query
      )}`;
      const searchReport = await fetchWithRetry(searchUrl, { signal, label: 'genius.search' });
      debugLog(
        'provider',
        'genius.search',
        {
          url: searchUrl,
          label: variant.label,
          status: searchReport.response?.status ?? 0,
          attempts: searchReport.attempts,
          ms: searchReport.ms,
        },
        searchReport.response?.ok ? 'info' : 'warn'
      );

      if (!searchReport.response?.ok) {
        if (searchReport.transient) {
          cleanup();
          debugLog(
            'provider',
            'genius.result',
            {
              provider: 'Genius',
              outcome: 'transient-error',
              status: searchReport.response?.status ?? 0,
              attempts: searchReport.attempts,
            },
            'error'
          );
          return { hasSync: false, provider: 'Genius', outcome: 'transient-error' };
        }
        continue;
      }

      const searchJson = (await searchReport.response.json()) as GeniusSearchResponse;
      const hits = collectHits(searchJson);
      if (!hits.length) {
        debugLog('provider', 'genius.result', {
          provider: 'Genius',
          outcome: 'not-found',
          label: variant.label,
        });
        continue;
      }

      let best: GeniusHit | null = null;
      for (const identity of variant.identities) {
        best = pickBestHit(hits, song, identity);
        if (best) break;
      }
      const path = best?.result?.path;
      if (!best) {
        sawGateRejection = true;
        debugLog(
          'provider',
          'genius.result',
          {
            provider: 'Genius',
            outcome: 'gate-rejected',
            label: variant.label,
            candidates: hits.length,
          },
          'warn'
        );
        continue;
      }
      if (!path) {
        // The hit passed the identity gate but carries no page path: that is a
        // provider miss, not an identity rejection.
        debugLog(
          'provider',
          'genius.result',
          {
            provider: 'Genius',
            outcome: 'not-found',
            label: variant.label,
            reason: 'missing-path',
          },
          'warn'
        );
        continue;
      }

      const pageUrl = `https://genius.com${path}`;
      const pageReport = await fetchWithRetry(pageUrl, { signal, label: 'genius.page' });
      cleanup();
      debugLog(
        'provider',
        'genius.page',
        {
          url: pageUrl,
          status: pageReport.response?.status ?? 0,
          attempts: pageReport.attempts,
          ms: pageReport.ms,
        },
        pageReport.response?.ok ? 'info' : 'warn'
      );
      if (!pageReport.response?.ok) {
        if (pageReport.transient) {
          debugLog(
            'provider',
            'genius.result',
            {
              provider: 'Genius',
              outcome: 'transient-error',
              status: pageReport.response?.status ?? 0,
              attempts: pageReport.attempts,
            },
            'error'
          );
          return { hasSync: false, provider: 'Genius', outcome: 'transient-error' };
        }
        continue;
      }

      const html = await pageReport.response.text();
      const lyrics = extractLyricsFromHtml(html);
      if (!lyrics) {
        debugLog('provider', 'genius.result', { provider: 'Genius', outcome: 'not-found' }, 'warn');
        continue;
      }
      debugLog('provider', 'genius.result', { provider: 'Genius', outcome: 'found' });
      return {
        plainLyrics: lyrics,
        syncedLyrics: undefined,
        hasSync: false,
        provider: 'Genius',
        outcome: 'found',
      };
    }

    cleanup();
    if (sawGateRejection) {
      debugLog(
        'provider',
        'genius.result',
        { provider: 'Genius', outcome: 'gate-rejected' },
        'warn'
      );
      return { ...empty, outcome: 'gate-rejected' };
    }
    debugLog('provider', 'genius.result', { provider: 'Genius', outcome: 'not-found' }, 'warn');
    return empty;
  } catch (error) {
    cleanup();
    debugLog(
      'provider',
      'genius.result',
      {
        provider: 'Genius',
        outcome: 'transient-error',
        error: error instanceof Error ? error.message : String(error),
      },
      'error'
    );
    return { hasSync: false, provider: 'Genius', outcome: 'transient-error' };
  }
}
