import { describe, expect, it } from 'vitest';
import { Song } from '../types/lyrics';
import { UNKNOWN_ARTIST } from './metadataSanitizer';
import {
  buildIdentityQueries,
  buildQueryVariants,
  reversedSplitIdentity,
} from './queryVariants';

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 's-1',
    title: 'Yesterday',
    artist: 'The Beatles',
    album: 'Help!',
    albumArt: '',
    durationMs: 125_000,
    ...overrides,
  };
}

describe('buildQueryVariants', () => {
  it('builds the full query first, then the title-only and the reversed one', () => {
    const variants = buildQueryVariants(song());

    expect(variants.map((v) => v.label)).toEqual(['full', 'title-only', 'artist-title']);
    expect(variants[0].query).toBe('yesterday the beatles');
    expect(variants[1].query).toBe('yesterday');
    expect(variants[2].query).toBe('the beatles yesterday');
  });

  it('never puts an unknown artist on the wire', () => {
    const variants = buildQueryVariants(song({ artist: UNKNOWN_ARTIST }));

    expect(variants.map((v) => v.label)).toEqual(['title-only']);
    expect(variants[0].query).toBe('yesterday');
    expect(variants[0].identities[0].artist).toBe('');
  });

  it('treats a blank artist as unknown', () => {
    const variants = buildQueryVariants(song({ artist: '' }));
    expect(variants.map((v) => v.label)).toEqual(['title-only']);
  });

  it('queries by artist alone when the player reported no title', () => {
    const variants = buildQueryVariants(song({ title: '', artist: 'Chevelle' }));

    expect(variants.map((v) => v.label)).toEqual(['artist-only']);
    expect(variants[0].query).toBe('chevelle');
    expect(variants[0].identities[0]).toEqual({ title: '', artist: 'chevelle' });
  });

  it('builds no variant when neither a title nor an artist is known', () => {
    expect(buildQueryVariants(song({ title: '', artist: UNKNOWN_ARTIST }))).toEqual([]);
  });

  it('carries the reversed identity of a split "Artist - Title" blob', () => {
    const variants = buildQueryVariants(
      song({ title: 'the family crest', artist: 'howl', splitFrom: 'howl - the family crest' })
    );

    const artistTitle = variants.find((v) => v.label === 'artist-title');
    expect(artistTitle?.identities).toHaveLength(2);
    expect(artistTitle?.identities[1]).toEqual({ title: 'howl', artist: 'the family crest' });
  });

  it('keeps a non-Latin title intact', () => {
    const variants = buildQueryVariants(song({ title: '東京事変', artist: '椎名林檎' }));

    expect(variants[0].query).toBe('東京事変 椎名林檎');
  });

  it('strips release noise from the query', () => {
    const variants = buildQueryVariants(
      song({ title: 'Yesterday (Remastered 2011)', artist: 'The Beatles' })
    );

    expect(variants[0].query).toBe('yesterday the beatles');
  });
});

describe('reversedSplitIdentity', () => {
  it('swaps the two halves of the original blob', () => {
    expect(
      reversedSplitIdentity(song({ splitFrom: 'howl - the family crest' }))
    ).toEqual({ title: 'howl', artist: 'the family crest' });
  });

  it('returns null without a split source', () => {
    expect(reversedSplitIdentity(song())).toBeNull();
  });

  it('returns null for a blob without a separator', () => {
    expect(reversedSplitIdentity(song({ splitFrom: 'howl the family crest' }))).toBeNull();
  });
});

describe('buildIdentityQueries', () => {
  it('flattens the variants into distinct identities', () => {
    const queries = buildIdentityQueries(song());

    expect(queries.map((q) => q.identity)).toEqual([
      { title: 'yesterday', artist: 'the beatles' },
      { title: 'yesterday', artist: '' },
    ]);
  });

  it('skips the title-less identity for title endpoints', () => {
    const queries = buildIdentityQueries(song({ title: '', artist: 'Chevelle' }));

    expect(queries).toHaveLength(1);
    expect(queries[0].identity.artist).toBe('chevelle');
  });
});
