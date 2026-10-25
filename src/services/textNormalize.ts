/**
 * Lookup-identity normalization.
 *
 * Real-world song titles carry release noise — `(Remastered 2011)`,
 * `[Explicit]`, `feat. Artist X`, punctuation variants — that makes exact
 * string matching fail constantly (round-3 tester feedback,
 * specs/Feedback03.md). This module derives a stable *lookup identity* used
 * for provider queries, local-store keys and candidate scoring. Display text
 * is never modified by anything here.
 *
 * Stripping is pattern-gated, not blanket: only bracketed segments and
 * trailing credits that match known release-noise patterns are removed, so
 * legitimate parenthetical titles like "(Everything I Do) I Do It for You"
 * survive intact.
 */

import { UNKNOWN_ARTIST } from './metadataSanitizer';

/** Bracketed segments whose content matches these patterns are release noise. */
const NOISE_SEGMENT_PATTERNS: RegExp[] = [
  /\bremaster(?:ed)?\b/i,
  /\bdeluxe\b/i,
  /\b(?:album|radio|single|video|album version)\s*edit\b/i,
  /\bversion\b/i,
  /\blive\b/i,
  /\bexplicit\b/i,
  /\bclean\b/i,
  /\banniversary\b/i,
  /\bmono\b/i,
  /\bstereo\b/i,
  /\bre-?issue\b/i,
  /\bbonus track\b/i,
  /\binstrumental\b/i,
  /\bacoustic\b/i,
  /\bdemo\b/i,
  /^\d{4}$/, // bare year: "(2011)"
];

/** Trailing featuring credits: "feat. X", "ft. X", "featuring X" (bracketed or not). */
const FEAT_CREDIT_RE =
  /\s*(?:[\(\[]\s*)?(?:feat\.?|ft\.?|featuring)\.?\s+(?:[^(\[\])\]]+?)?(?:[\)\]]|$)\s*$/i;

/** Unbracketed trailing "feat." with no artist following (e.g. "Song feat."). */
const FEAT_TRAILING_ONLY_RE = /\s*(?:[-–—|,]\s*)?(?:feat\.?|ft\.?|featuring)\.?\s*$/i;

/**
 * Unbracketed trailing release-noise suffixes: "Song - Remastered 2011",
 * "Song | Live", "Song - Explicit". Only stripped when they form the tail of
 * the string after a separator, so in-title words never match.
 */
const TRAILING_NOISE_RE =
  /\s*[-–—|,]\s*(?:remaster(?:ed)?(?:\s+(?:edition|version))?(?:\s+\d{4})?|deluxe(?:\s+edition)?|single(?:\s+version)?|radio\s+edit|album\s+version|live|explicit|clean)\s*$/i;

function isNoiseSegment(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  return NOISE_SEGMENT_PATTERNS.some((re) => re.test(trimmed));
}

/** Removes pattern-gated release noise: noise bracketed segments + feat credits. */
export function stripReleaseNoise(text: string): string {
  let out = text;
  // Repeatedly drop noise bracketed segments (nested/multiple per title).
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/[\(\[\{]([^\)\]\}]*)[\)\]\}]/g, (match, content: string) =>
      isNoiseSegment(content) ? ' ' : match
    );
    if (next === out) break;
    out = next;
  }
  // Trailing featuring credits and unbracketed noise suffixes.
  out = out.replace(FEAT_CREDIT_RE, ' ');
  out = out.replace(FEAT_TRAILING_ONLY_RE, ' ');
  out = out.replace(TRAILING_NOISE_RE, ' ');
  return out;
}

/**
 * Normalizes free text to its lookup form: lowercase, accent-folded (NFD
 * combining-mark strip), release noise removed, punctuation collapsed to
 * single spaces, trimmed. Returns '' for blank input.
 *
 * Unicode-safe: letters and digits from any script are preserved (non-Latin
 * titles like "東京事変" must remain searchable; spec 17 RC5).
 */
export function normalizeQueryText(text: string): string {
  const stripped = stripReleaseNoise(text);
  const lower = stripped.toLowerCase();
  // Fold combining diacritics where present (Latin, etc.).
  const decomposed = lower.normalize('NFD');
  const noDiacritics = decomposed.replace(/\p{M}+/gu, '');
  // Recompose to NFC so Hangul/CJK stay in their canonical composed form.
  const recomposed = noDiacritics.normalize('NFC');
  // Keep word characters (letters/digits/underscore) from any Unicode script.
  const spaced = recomposed.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return spaced;
}

/**
 * Stable local-store/query identity for a title/artist pair. The
 * `UNKNOWN_ARTIST` placeholder folds to a fixed token so the scorer can
 * detect title-only matching.
 */
export function identityKey(title: string, artist: string): string {
  return `${normalizeQueryText(title)}|${normalizeQueryText(artist)}`;
}

/** True when the artist is the deliberate unknown-artist placeholder (or blank). */
export function isUnknownArtist(artist: string): boolean {
  const normalized = normalizeQueryText(artist);
  return normalized === '' || normalized === normalizeQueryText(UNKNOWN_ARTIST);
}
