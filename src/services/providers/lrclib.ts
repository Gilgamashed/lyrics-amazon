import { Song } from '../../types/lyrics';
import { parseLrc } from '../lrcParser';
import { evaluateIdentityGate, identityScore, IdentityGateResult } from '../matchScore';
import { buildQueryVariants, LookupIdentity } from '../queryVariants';
import { fetchWithRetry } from '../httpRetry';
import { debugLog } from '../debugConsole';
import { withTimeoutSignal } from './base';
import { LyricsProviderResult } from './types';

/**
 * LRCLIB rejects `/api/get` with HTTP 400 unless the duration is between 1 and
 * 3600 seconds. Longer tracks are still ranked by duration locally, but they
 * must never be sent to `/api/get` (spec 17, W3/RC4).
 */
export const LRCLIB_MAX_GET_DURATION_SECONDS = 3600;

interface LrcLibTrack {
  id?: number;
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

function toResult(track: LrcLibTrack): LyricsProviderResult | null {
  if (track.syncedLyrics) {
    const parsed = parseLrc(track.syncedLyrics);
    if (parsed.length > 0) {
      return {
        syncedLyrics: parsed,
        plainLyrics: track.plainLyrics || parsed.map((l) => l.text).join('\n'),
        hasSync: true,
        provider: 'LRCLIB',
        outcome: 'found',
      };
    }
  }
  if (track.plainLyrics) {
    return {
      syncedLyrics: undefined,
      plainLyrics: track.plainLyrics,
      hasSync: false,
      provider: 'LRCLIB',
      outcome: 'found',
    };
  }
  return null;
}

/** True when the track carries any identity field we can verify against. */
function hasIdentityFields(t: LrcLibTrack): boolean {
  return Boolean((t.trackName ?? '').trim() || (t.artistName ?? '').trim());
}

interface AcceptedCandidate {
  track: LrcLibTrack;
  identity: LookupIdentity;
  titleScore: number | null;
  artistScore: number | null;
}

interface RejectedCandidate {
  title: string;
  artist: string;
  rejection?: string;
  titleScore: number | null;
  artistScore: number | null;
}

/**
 * Picks the best candidate from a provider answer.
 *
 * A candidate is accepted when it passes the identity gate for *any* of the
 * identities the current query variant carries (the canonical one and, for a
 * split title, the reversed one). Candidates carrying no identity fields at
 * all pass unverified, as before.
 *
 * Accepted candidates are then ranked: a duration match (+/-3s) wins, then the
 * highest identity score, preferring one that carries timing.
 */
function pickBest(
  tracks: LrcLibTrack[],
  identities: LookupIdentity[],
  duration: number,
  durationKnown: boolean
): LrcLibTrack | null {
  const accepted: AcceptedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const track of tracks) {
    if (!hasIdentityFields(track)) {
      accepted.push({
        track,
        identity: identities[0] ?? { title: '', artist: '' },
        titleScore: 1,
        artistScore: null,
      });
      continue;
    }

    for (const identity of identities) {
      const gate: IdentityGateResult = evaluateIdentityGate(
        track.trackName ?? '',
        track.artistName ?? '',
        identity.title,
        identity.artist
      );
      if (gate.passed) {
        accepted.push({
          track,
          identity,
          titleScore: gate.titleScore,
          artistScore: gate.artistScore,
        });
        break;
      }
      if (identity === identities[0]) {
        rejected.push({
          title: track.trackName ?? '',
          artist: track.artistName ?? '',
          rejection: gate.rejection,
          titleScore: gate.titleScore === null ? null : Number(gate.titleScore.toFixed(3)),
          artistScore: gate.artistScore === null ? null : Number(gate.artistScore.toFixed(3)),
        });
      }
    }
  }
  if (rejected.length > 0) {
    debugLog('gate', 'lrclib.candidate-rejected', {
      identities,
      candidates: tracks.length,
      rejected,
    });
  }

  if (accepted.length === 0) return null;

  if (durationKnown) {
    const within = accepted.filter(
      (item) =>
        typeof item.track.duration === 'number' &&
        Math.abs((item.track.duration as number) - duration) <= 3
    );
    if (within.length > 0) {
      return within.find((item) => item.track.syncedLyrics)?.track ?? within[0].track;
    }
  }

  let best: LrcLibTrack | null = null;
  let bestScore = -1;
  for (const item of accepted) {
    // The score uses whichever identity the query variant enforced: the title
    // when it is known, otherwise the artist (artist-only variant).
    const score = identityScore(item.titleScore, item.artistScore);
    if (score > bestScore) {
      bestScore = score;
      best = item.track;
    }
  }
  return best;
}

export async function fetchLrcLib(
  song: Song,
  timeoutMs = 4000,
  externalSignal?: AbortSignal
): Promise<LyricsProviderResult> {
  const { signal, cleanup } = withTimeoutSignal(timeoutMs, externalSignal);
  const empty: LyricsProviderResult = { hasSync: false, provider: 'LRCLIB', outcome: 'not-found' };

  try {
    const duration = Math.round(song.durationMs / 1000);
    const durationKnown = Number.isFinite(duration) && duration > 0;
    // `/api/get` has a stricter window than the local ranking rule.
    const durationValidForGet =
      durationKnown && duration <= LRCLIB_MAX_GET_DURATION_SECONDS;
    const variants = buildQueryVariants(song);

    if (variants.length === 0) {
      cleanup();
      debugLog(
        'provider',
        'lrclib.result',
        { provider: 'LRCLIB', outcome: 'not-found', reason: 'no-query' },
        'warn'
      );
      return empty;
    }

    debugLog('provider', 'lrclib.query', {
      title: song.title,
      artist: song.artist,
      duration,
      durationKnown,
      variants: variants.map((variant) => ({
        label: variant.label,
        query: variant.query,
        identities: variant.identities,
      })),
    });

    const primary = variants[0];
    const primaryIdentity = primary.identities[0];
    const artistKnown = Boolean(primaryIdentity?.artist);
    const titleKnown = Boolean(primaryIdentity?.title);

    // `/api/get` needs an exact title/artist/duration match. It answers HTTP
    // 400 when the duration is invalid and cannot be asked without a title or
    // an artist, so it is only used when the player reported all three.
    if (durationValidForGet && artistKnown && titleKnown && primaryIdentity) {
      const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
        primaryIdentity.title
      )}&artist_name=${encodeURIComponent(primaryIdentity.artist)}&duration=${duration}`;

      const report = await fetchWithRetry(getUrl, { signal, label: 'lrclib.get' });
      debugLog(
        'provider',
        'lrclib.get',
        { url: getUrl, status: report.response?.status ?? 0, attempts: report.attempts, ms: report.ms },
        report.response?.ok ? 'info' : 'warn'
      );

      if (report.response?.ok) {
        const data = (await report.response.json()) as LrcLibTrack;
        // The server matched exactly on the normalized strings; still verify the
        // identity when the response carries it so a decorated lookalike never
        // wins silently.
        if (
          !hasIdentityFields(data) ||
          evaluateIdentityGate(
            data.trackName ?? '',
            data.artistName ?? '',
            primaryIdentity.title,
            primaryIdentity.artist
          ).passed
        ) {
          const direct = toResult(data);
          if (direct) {
            cleanup();
            debugLog('provider', 'lrclib.result', { provider: 'LRCLIB', outcome: 'exact-match' });
            return direct;
          }
        }
      } else if (report.transient) {
        // A transient `/api/get` failure must not end the request: the search
        // endpoint may still answer.
        debugLog(
          'provider',
          'lrclib.get-transient',
          { provider: 'LRCLIB', status: report.response?.status ?? 0, attempts: report.attempts },
          'warn'
        );
      }
    } else {
      debugLog(
        'provider',
        'lrclib.get-skipped',
        {
          durationKnown,
          durationValidForGet,
          artistKnown,
          titleKnown,
          reason: !durationKnown
            ? 'duration-unknown'
            : !durationValidForGet
              ? 'duration-invalid'
              : !artistKnown
                ? 'artist-unknown'
                : 'title-unknown',
        },
        'debug'
      );
    }

    // The search endpoint tolerates a free-text query, so every variant is
    // tried in order until one yields a gate-passing candidate.
    let sawGateRejection = false;
    for (const variant of variants) {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(variant.query)}`;
      const report = await fetchWithRetry(searchUrl, { signal, label: 'lrclib.search' });
      debugLog(
        'provider',
        'lrclib.search',
        {
          url: searchUrl,
          label: variant.label,
          status: report.response?.status ?? 0,
          attempts: report.attempts,
          ms: report.ms,
        },
        report.response?.ok ? 'info' : 'warn'
      );

      if (!report.response?.ok) {
        if (report.transient) {
          cleanup();
          debugLog(
            'provider',
            'lrclib.result',
            {
              provider: 'LRCLIB',
              outcome: 'transient-error',
              status: report.response?.status ?? 0,
              attempts: report.attempts,
            },
            'error'
          );
          return { hasSync: false, provider: 'LRCLIB', outcome: 'transient-error' };
        }
        continue;
      }

      const list = (await report.response.json()) as LrcLibTrack[];
      if (!Array.isArray(list) || list.length === 0) {
        debugLog('provider', 'lrclib.result', {
          provider: 'LRCLIB',
          outcome: 'not-found',
          label: variant.label,
        });
        continue;
      }

      const best = pickBest(list, variant.identities, duration, durationKnown);
      if (!best) {
        sawGateRejection = true;
        debugLog(
          'provider',
          'lrclib.result',
          {
            provider: 'LRCLIB',
            outcome: 'gate-rejected',
            label: variant.label,
            candidates: list.length,
          },
          'warn'
        );
        continue;
      }

      const result = toResult(best);
      if (result) {
        cleanup();
        debugLog('provider', 'lrclib.result', {
          provider: 'LRCLIB',
          outcome: 'matched',
          label: variant.label,
          title: best.trackName ?? '',
          artist: best.artistName ?? '',
          candidates: list.length,
        });
        return result;
      }
    }

    cleanup();
    if (sawGateRejection) {
      debugLog(
        'provider',
        'lrclib.result',
        { provider: 'LRCLIB', outcome: 'gate-rejected' },
        'warn'
      );
      return { ...empty, outcome: 'gate-rejected' };
    }
    debugLog('provider', 'lrclib.result', { provider: 'LRCLIB', outcome: 'not-found' }, 'warn');
    return empty;
  } catch (error) {
    cleanup();
    debugLog(
      'provider',
      'lrclib.result',
      {
        provider: 'LRCLIB',
        outcome: 'transient-error',
        error: error instanceof Error ? error.message : String(error),
      },
      'error'
    );
    return { hasSync: false, provider: 'LRCLIB', outcome: 'transient-error' };
  }
}
