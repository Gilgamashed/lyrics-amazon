/**
 * Fuzzy identity scoring for lyric-lookup candidates.
 *
 * Providers return candidate tracks whose titles/artists rarely match the
 * detected metadata exactly (`(Remastered 2011)`, `[Explicit]`, `feat. X`,
 * punctuation drift — specs/Feedback03.md). Every candidate must pass an
 * identity gate before its lyrics are used; a provider whose candidates all
 * fail counts as a miss and the chain degrades to the next source instead of
 * playing the wrong song.
 *
 * `similarity` combines normalized Levenshtein similarity (via
 * `fastest-levenshtein`) with token-set containment, taking the better score
 * so short insertions/deletions and token-order drift are both tolerated.
 */

import { distance } from 'fastest-levenshtein';
import { normalizeQueryText, isUnknownArtist } from './textNormalize';

/**
 * Minimum similarity for a candidate title (and artist, when known) to be
 * accepted as the same song. Boundary-tested in matchScore.test.ts.
 */
export const MIN_IDENTITY_SCORE = 0.8;

/** Edit-distance similarity in [0, 1]; two identical (or both empty) strings score 1. */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  // Both normalize to empty (e.g. non-Latin stripped oddly) — treat as equal.
  if (a.trim() === '' && b.trim() === '') return 1;
  return 1 - distance(a, b) / maxLen;
}

/**
 * Token-set containment in [0, 1]: the overlap coefficient over whitespace-
 * tokenized sets, so a candidate containing all of the query's tokens (in any
 * order) scores 1 regardless of extra tokens.
 */
export function tokenSetSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared += 1;
  }
  const smaller = Math.min(setA.size, setB.size);
  return shared / smaller;
}

/** Best of edit-distance and token-set similarity over normalized text. */
export function similarity(a: string, b: string): number {
  const na = normalizeQueryText(a);
  const nb = normalizeQueryText(b);
  if (na === '' && nb === '') return 1;
  return Math.max(levenshteinSimilarity(na, nb), tokenSetSimilarity(na, nb));
}

/**
 * Identity gate: does this candidate look like the same song as the query?
 *
 * - Title must meet `MIN_IDENTITY_SCORE`.
 * - Artist must too — unless the query artist is the `Unknown Artist`
 *   placeholder (or blank), in which case only the title is scored.
 */
export function passesIdentityGate(
  candidateTitle: string,
  candidateArtist: string,
  queryTitle: string,
  queryArtist: string
): boolean {
  return evaluateIdentityGate(candidateTitle, candidateArtist, queryTitle, queryArtist).passed;
}

/** Why a candidate was rejected by the identity gate (spec 17 diagnostics). */
export type IdentityGateRejection = 'title-mismatch' | 'artist-mismatch';

export interface IdentityGateResult {
  passed: boolean;
  /** `null` when the query title is unknown (the title is not scored). */
  titleScore: number | null;
  /** `null` when the query artist is unknown (the artist is not scored). */
  artistScore: number | null;
  rejection?: IdentityGateRejection;
}

/**
 * Combines the enforced identity scores into a single ranking value.
 *
 * - Title known, artist known: the weaker of the two.
 * - Title known, artist unknown: the title score.
 * - Title unknown (artist-only variant): the artist score.
 */
export function identityScore(titleScore: number | null, artistScore: number | null): number {
  if (titleScore === null) return artistScore ?? 0;
  if (artistScore === null) return titleScore;
  return Math.min(titleScore, artistScore);
}

/**
 * Same decision as `passesIdentityGate`, but it also reports the scores and the
 * rejection reason so the debug terminal can explain why a provider candidate
 * was discarded.
 *
 * The gate is tiered (spec 17, W4): the title is enforced whenever it is
 * known, and the artist is enforced whenever it is known. When the player
 * reported no title at all, the title cannot be enforced - the artist is then
 * the only identity left to check (the artist-only query variant).
 */
export function evaluateIdentityGate(
  candidateTitle: string,
  candidateArtist: string,
  queryTitle: string,
  queryArtist: string
): IdentityGateResult {
  const titleKnown = normalizeQueryText(queryTitle).length > 0;
  const titleScore = titleKnown ? similarity(candidateTitle, queryTitle) : null;
  if (titleScore !== null && titleScore < MIN_IDENTITY_SCORE) {
    return { passed: false, titleScore, artistScore: null, rejection: 'title-mismatch' };
  }

  if (isUnknownArtist(queryArtist)) {
    return { passed: true, titleScore, artistScore: null };
  }

  const artistScore = similarity(candidateArtist, queryArtist);
  if (artistScore < MIN_IDENTITY_SCORE) {
    return { passed: false, titleScore, artistScore, rejection: 'artist-mismatch' };
  }

  return { passed: true, titleScore, artistScore };
}
