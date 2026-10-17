/**
 * Sanitizes raw SMTC metadata before it is trusted as a song identity.
 *
 * Amazon Music and other sources occasionally report junk — a literal
 * "Artist name" in the title slot, blank fields, or the artist duplicated into
 * the title. Such readings are rejected (return `null`) so the app keeps the
 * last good track instead of loading nonsense. A genuinely missing artist is
 * rendered with a single deliberate fallback.
 */

/** Literal placeholder values SMTC sources have been seen to emit. */
const PLACEHOLDERS = new Set([
  'artist name',
  'song name',
  'track name',
  'now playing',
  'unknown',
  'unknown artist',
  'unknown track',
  'unknown title',
]);

export const UNKNOWN_ARTIST = 'Unknown Artist';

export interface SanitizedMetadata {
  title: string;
  artist: string;
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDERS.has(value.trim().toLowerCase());
}

/**
 * Validates and normalizes a raw title/artist pair.
 *
 * - Rejects blank and placeholder titles, and title === artist duplicates.
 * - Splits a combined `"Title - Artist"` title when the artist is absent.
 * - Returns `UNKNOWN_ARTIST` only when the artist is genuinely missing.
 * - Returns `null` when the reading should not replace the current track.
 */
export function sanitizeMetadata(
  rawTitle: string | null | undefined,
  rawArtist: string | null | undefined
): SanitizedMetadata | null {
  let title = (rawTitle ?? '').trim();
  let artist = (rawArtist ?? '').trim();

  if (isPlaceholder(artist)) artist = '';

  if (!artist && title.includes(' - ')) {
    const [head, ...tail] = title.split(' - ');
    const splitArtist = tail.join(' - ').trim();
    if (head.trim() && splitArtist) {
      title = head.trim();
      artist = splitArtist;
    }
  }

  if (!title || isPlaceholder(title)) return null;

  if (artist && artist.toLowerCase() === title.toLowerCase()) return null;

  return { title, artist: artist || UNKNOWN_ARTIST };
}
