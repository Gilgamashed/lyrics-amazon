/**
 * Sanitizes raw SMTC metadata before it is trusted as a song identity.
 *
 * Amazon Music and other sources occasionally report junk — a literal
 * "Artist name" in the title slot, blank fields, or the artist duplicated into
 * the title. Spec 17 (W2) requires that such a reading is **never dropped**:
 * the inspection returns a status (`ok | missing-title | placeholder |
 * duplicate | empty-reading`) and the track is adopted anyway, with the title
 * marked as missing so the UI can ask the user for it. Only a genuinely empty
 * reading (no title and no artist) keeps the previous track.
 *
 * A genuinely missing artist is rendered with a single deliberate fallback.
 */

import { debugLog } from './debugConsole';

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
  /** True if the title was missing/reported as placeholder and we adopted the track anyway. */
  titleMissing?: boolean;
  /**
   * When the title/artist were recovered by splitting "A - B" (spec 17),
   * records the original combined string for diagnostics/query recovery.
   */
  splitFrom?: string;
  /** How the reading was admitted (spec 17, W2). */
  status?: MetadataStatus;
}

/**
 * How a raw reading was admitted (spec 17, W2).
 *
 * - `ok` — the title/artist pair is usable as it stands.
 * - `missing-title` — the player reported no title; the track is adopted anyway.
 * - `placeholder` — the player reported a placeholder title ("Unknown Track");
 *   the track is adopted anyway.
 * - `duplicate` — title === artist; read as *title-only* (the artist is unknown).
 * - `empty-reading` — neither a title nor an artist: there is nothing to adopt,
 *   so the previous track is kept.
 */
export type MetadataStatus =
  | 'ok'
  | 'missing-title'
  | 'placeholder'
  | 'duplicate'
  | 'empty-reading';

export interface MetadataInspection {
  ok: boolean;
  title: string;
  artist: string;
  /** How the reading was admitted (spec 17, W2). */
  status: MetadataStatus;
  titleMissing?: boolean;
  splitFrom?: string;
  reason?: MetadataRejection;
}

/** Why a raw reading was not accepted as a song identity (spec 17 diagnostics). */
export type MetadataRejection = 'missing-title' | 'placeholder-title' | 'duplicate-title-artist';

function isPlaceholder(value: string): boolean {
  return PLACEHOLDERS.has(value.trim().toLowerCase());
}

/**
 * Case/accent/punctuation-insensitive comparison for the two halves of an
 * `"Artist - Title"` title. Kept local so the sanitizer does not depend on the
 * lookup-normalization module (which already imports `UNKNOWN_ARTIST` from
 * this module).
 */
function sameIdentityPart(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return normalize(a) === normalize(b) && normalize(a).length > 0;
}

/**
 * Validates and normalizes a raw title/artist pair and reports *why* a
 * reading was rejected, so the debug terminal can explain a silent track
 * drop.
 *
 * - Rejects blank and placeholder titles, and title === artist duplicates.
 * - Splits a combined `"Artist - Title"` title when the artist is absent, or
 *   when a known artist is repeated in the title. The recovered title is
 *   stored as `splitFrom`.
 * - Returns `UNKNOWN_ARTIST` only when the artist is genuinely missing.
 */
export function inspectMetadata(
  rawTitle: string | null | undefined,
  rawArtist: string | null | undefined
): MetadataInspection {
  let title = (rawTitle ?? '').trim();
  let artist = (rawArtist ?? '').trim();

  if (isPlaceholder(artist)) artist = '';

  let splitFrom: string | undefined;

  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      const head = parts[0].trim();
      const tail = parts.slice(1).join(' - ').trim();
      if (head && tail) {
        if (!artist) {
          // Spec 17 (user-approved): with no artist, "A - B" means
          // Artist - Title.
          artist = head;
          title = tail;
          splitFrom = rawTitle ?? title;
          debugLog(
            'metadata',
            'split-artist-title',
            { rawTitle, rawArtist, artist, title, orientation: 'artist-title' },
            'info'
          );
        } else if (sameIdentityPart(head, artist)) {
          // The artist is known and repeated in the title:
          // "Artist - Title" -> strip the artist prefix.
          title = tail;
          splitFrom = rawTitle ?? title;
          debugLog(
            'metadata',
            'split-artist-title',
            { rawTitle, rawArtist, artist, title, orientation: 'artist-title' },
            'info'
          );
        } else if (sameIdentityPart(tail, artist)) {
          // "Title - Artist" -> strip the artist suffix. Leave the artist as
          // the value the player reported.
          title = head;
          splitFrom = rawTitle ?? title;
          debugLog(
            'metadata',
            'split-artist-title',
            { rawTitle, rawArtist, artist, title, orientation: 'title-artist' },
            'info'
          );
        }
        // If neither half matches a known artist, the separator may be part of
        // a legitimate title ("Love - Hate"). Leave it untouched.
      }
    }
  }

  if (!title && !artist) {
    // Nothing usable at all: keep the previous track instead of adopting an
    // empty identity (spec 17, W2).
    debugLog('metadata', 'reading-empty', { rawTitle, rawArtist }, 'warn');
    return {
      ok: false,
      title: '',
      artist: UNKNOWN_ARTIST,
      status: 'empty-reading',
      titleMissing: true,
      splitFrom,
      reason: 'missing-title',
    };
  }

  if (!title) {
    // W2: never drop a track. Adopt it with title missing.
    const adoptedArtist = artist || UNKNOWN_ARTIST;
    debugLog(
      'metadata',
      'title-missing-adopted',
      { rawTitle, rawArtist, artist: adoptedArtist },
      'warn'
    );
    return {
      ok: true,
      title: '',
      artist: adoptedArtist,
      status: 'missing-title',
      titleMissing: true,
      splitFrom,
    };
  }
  if (isPlaceholder(title)) {
    const adoptedArtist = artist || UNKNOWN_ARTIST;
    debugLog(
      'metadata',
      'title-placeholder-adopted',
      { rawTitle, rawArtist, title, artist: adoptedArtist },
      'warn'
    );
    return {
      ok: true,
      title: '',
      artist: adoptedArtist,
      status: 'placeholder',
      titleMissing: true,
      splitFrom,
    };
  }

  if (artist && artist.toLowerCase() === title.toLowerCase()) {
    // Read as title-only (artist unknown), not rejection
    debugLog('metadata', 'title-equals-artist-title-only', { title, artist }, 'warn');
    return {
      ok: true,
      title,
      artist: UNKNOWN_ARTIST,
      status: 'duplicate',
      titleMissing: false,
      splitFrom,
    };
  }

  return {
    ok: true,
    title,
    artist: artist || UNKNOWN_ARTIST,
    status: 'ok',
    titleMissing: false,
    splitFrom,
  };
}

/**
 * Validates and normalizes a raw title/artist pair.
 *
 * - Splits a combined `"Artist - Title"` title when the artist is absent or
 *   repeated in the title.
 * - Returns `UNKNOWN_ARTIST` only when the artist is genuinely missing.
 * - Reads `title === artist` as *title-only* instead of rejecting the reading.
 * - Returns `null` only when the reading is genuinely empty (no title and no
 *   artist), so the app keeps the previous track.
 */
export function sanitizeMetadata(
  rawTitle: string | null | undefined,
  rawArtist: string | null | undefined
): SanitizedMetadata | null {
  const result = inspectMetadata(rawTitle, rawArtist);
  if (!result.ok) return null;
  return {
    title: result.title,
    artist: result.artist,
    titleMissing: result.titleMissing,
    splitFrom: result.splitFrom,
    status: result.status,
  };
}
