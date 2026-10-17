import { describe, expect, it } from 'vitest';
import { UNKNOWN_ARTIST, sanitizeMetadata } from './metadataSanitizer';

describe('sanitizeMetadata', () => {
  it('passes through a clean title and artist', () => {
    expect(sanitizeMetadata('Rasa', 'oktobernatt')).toEqual({
      title: 'Rasa',
      artist: 'oktobernatt',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeMetadata('  talk  ', '  periphery  ')).toEqual({
      title: 'talk',
      artist: 'periphery',
    });
  });

  it('rejects blank and whitespace-only titles', () => {
    expect(sanitizeMetadata('', 'oktobernatt')).toBeNull();
    expect(sanitizeMetadata('   ', 'oktobernatt')).toBeNull();
    expect(sanitizeMetadata(null, 'oktobernatt')).toBeNull();
    expect(sanitizeMetadata(undefined, undefined)).toBeNull();
  });

  it('rejects the literal "Artist name" placeholder title', () => {
    expect(sanitizeMetadata('Artist name', 'oktobernatt')).toBeNull();
    expect(sanitizeMetadata('ARTIST NAME', 'oktobernatt')).toBeNull();
  });

  it.each(['Song name', 'Track name', 'Now Playing', 'Unknown track'])(
    'rejects the placeholder title %s',
    (value) => {
      expect(sanitizeMetadata(value, 'Someone')).toBeNull();
    }
  );

  it('rejects a duplicated title/artist', () => {
    expect(sanitizeMetadata('howl', 'HOWL')).toBeNull();
  });

  it('parses a combined "Title - Artist" title when the artist is absent', () => {
    expect(sanitizeMetadata('howl - the family crest', null)).toEqual({
      title: 'howl',
      artist: 'the family crest',
    });
  });

  it('keeps only the first split segment as the artist', () => {
    expect(sanitizeMetadata('sabada - filous - remix', '')).toEqual({
      title: 'sabada',
      artist: 'filous - remix',
    });
  });

  it('does not split when the artist is already present', () => {
    expect(sanitizeMetadata('Left - Right', 'Artist')).toEqual({
      title: 'Left - Right',
      artist: 'Artist',
    });
  });

  it('returns the deliberate fallback for a genuinely missing artist', () => {
    expect(sanitizeMetadata('Rasa', null)).toEqual({ title: 'Rasa', artist: UNKNOWN_ARTIST });
    expect(sanitizeMetadata('Rasa', '   ')).toEqual({ title: 'Rasa', artist: UNKNOWN_ARTIST });
  });

  it('treats a placeholder artist as missing', () => {
    expect(sanitizeMetadata('Rasa', 'Unknown Artist')).toEqual({
      title: 'Rasa',
      artist: UNKNOWN_ARTIST,
    });
  });

  it('does not split when the combined title has an empty artist segment', () => {
    expect(sanitizeMetadata('Rasa - ', '')).toEqual({ title: 'Rasa -', artist: UNKNOWN_ARTIST });
  });
});

// Round-2 live-testing regression: these tracks were reported as "not even
// attempting a lyrics search". They must survive sanitization intact so the
// metadata layer always hands a searchable title/artist to the provider chain.
describe('reported live-testing tracks', () => {
  it.each([
    ['Rasa', 'oktobernatt'],
    ['talk', 'periphery'],
    ['howl', 'the family crest'],
    ['sabada', 'filous'],
  ])('accepts %s by %s unchanged', (title, artist) => {
    expect(sanitizeMetadata(title, artist)).toEqual({ title, artist });
  });
});
