/**
 * Lookup query variants (spec 17, W4).
 *
 * A single query string is not enough to reach a track. The player may report
 * a missing title, an unknown artist, a decorated title, or a combined
 * `"Artist - Title"` blob, and every one of those shapes produces a different
 * (often empty) query on the wire. This module derives the ordered list of
 * queries that may be sent for a song, together with the identities a
 * candidate may match.
 *
 * Rules:
 * - An unknown artist never appears on the wire: the variants that need it are
 *   dropped, and the title-only variant is used instead.
 * - The title is always enforced by the identity gate; the artist is enforced
 *   only when it is known.
 * - A title that was split out of an `"Artist - Title"` blob also contributes
 *   the reversed identity, so a wrong guess about the order cannot silently
 *   kill the lookup.
 */

import { Song } from '../types/lyrics';
import { isUnknownArtist, normalizeQueryText } from './textNormalize';

export type QueryVariantLabel = 'full' | 'title-only' | 'artist-title' | 'artist-only';

/** A song identity a provider candidate may match. */
export interface LookupIdentity {
  /** Canonical title the candidate must match. */
  title: string;
  /** Canonical artist the candidate must match; `''` means "not enforced". */
  artist: string;
}

export interface QueryVariant {
  label: QueryVariantLabel;
  /** The normalized phrase that goes on the wire. */
  query: string;
  /** Identities a candidate may match; the first that passes the gate wins. */
  identities: LookupIdentity[];
}

function pushVariant(
  variants: QueryVariant[],
  label: QueryVariantLabel,
  query: string,
  identities: LookupIdentity[]
): void {
  if (!query) return;
  if (variants.some((variant) => variant.query === query)) return;
  variants.push({ label, query, identities });
}

/**
 * Builds the ordered query variants for a song.
 *
 * `full` (title + artist) is tried first because it is the most specific
 * query; `title-only` is the fallback for an unknown artist; `artist-title`
 * reorders the same words because some catalogues index them that way.
 */
export function buildQueryVariants(song: Song): QueryVariant[] {
  const title = normalizeQueryText(song.title);
  const artist = normalizeQueryText(song.artist);
  const artistKnown = artist.length > 0 && !isUnknownArtist(song.artist);

  const variants: QueryVariant[] = [];

  const primary: LookupIdentity = { title, artist: artistKnown ? artist : '' };

  if (title && artistKnown) {
    pushVariant(variants, 'full', `${title} ${artist}`, [primary]);
  }

  if (title) {
    // The artist is not enforced here: the query carries no artist at all.
    pushVariant(variants, 'title-only', title, [{ title, artist: '' }]);
  }

  if (title && artistKnown) {
    // The reversed phrasing of the same words, plus - for a title that was
    // split out of an "Artist - Title" blob - the reversed identity.
    const identities: LookupIdentity[] = [primary];
    const reversed = reversedSplitIdentity(song);
    if (reversed) identities.push(reversed);
    pushVariant(variants, 'artist-title', `${artist} ${title}`, identities);
  }

  if (!title && artistKnown) {
    // The player reported no title (spec 17, W2). The artist is the only
    // identity left, so the query carries the artist alone and the gate
    // enforces the artist instead of the title.
    pushVariant(variants, 'artist-only', artist, [{ title: '', artist }]);
  }

  return variants;
}

/**
 * The identity hidden behind a split title.
 *
 * `splitFrom` holds the original `"Artist - Title"` blob, so the pair the
 * sanitizer did *not* choose is recoverable: head as the title, tail as the
 * artist.
 */
export function reversedSplitIdentity(song: Song): LookupIdentity | null {
  const source = song.splitFrom?.trim();
  if (!source) return null;
  const parts = source.split(' - ');
  if (parts.length < 2) return null;
  const head = normalizeQueryText(parts[0]);
  const tail = normalizeQueryText(parts.slice(1).join(' - '));
  if (!head || !tail) return null;
  return { title: head, artist: tail };
}

/** One identity to ask a provider for, in priority order. */
export interface IdentityQuery {
  label: QueryVariantLabel;
  identity: LookupIdentity;
}

/**
 * Flattens the variants into the distinct identities to try, in order.
 *
 * Providers that take separate title/artist parameters (Lyrica) use this
 * instead of the free-text query strings.
 */
export function buildIdentityQueries(song: Song): IdentityQuery[] {
  const queries: IdentityQuery[] = [];
  const seen = new Set<string>();
  for (const variant of buildQueryVariants(song)) {
    for (const identity of variant.identities) {
      const key = `${identity.title}|${identity.artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push({ label: variant.label, identity });
    }
  }
  return queries;
}
