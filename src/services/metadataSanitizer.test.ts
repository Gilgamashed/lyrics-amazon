import { describe, expect, it } from 'vitest';
import { UNKNOWN_ARTIST, inspectMetadata, sanitizeMetadata } from './metadataSanitizer';

describe('sanitizeMetadata', () => {
  it('passes through a clean title and artist', () => {
    expect(sanitizeMetadata('Rasa', 'oktobernatt')).toEqual({
      title: 'Rasa',
      artist: 'oktobernatt',
      titleMissing: false,
      status: 'ok',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeMetadata('  talk  ', '  periphery  ')).toEqual({
      title: 'talk',
      artist: 'periphery',
      titleMissing: false,
      status: 'ok',
    });
  });

  // Spec 17, W2: a reading is never dropped. A missing or placeholder title is
  // adopted with `titleMissing`, so the UI can ask the user for it.
  it('adopts a reading with a blank title instead of dropping it', () => {
    expect(sanitizeMetadata('', 'oktobernatt')).toEqual({
      title: '',
      artist: 'oktobernatt',
      titleMissing: true,
      status: 'missing-title',
    });
    expect(sanitizeMetadata('   ', 'oktobernatt')).toEqual({
      title: '',
      artist: 'oktobernatt',
      titleMissing: true,
      status: 'missing-title',
    });
    expect(sanitizeMetadata(null, 'oktobernatt')).toEqual({
      title: '',
      artist: 'oktobernatt',
      titleMissing: true,
      status: 'missing-title',
    });
  });

  it('adopts a reading with a placeholder title', () => {
    expect(sanitizeMetadata('Artist name', 'oktobernatt')).toEqual({
      title: '',
      artist: 'oktobernatt',
      titleMissing: true,
      status: 'placeholder',
    });
    expect(sanitizeMetadata('ARTIST NAME', 'oktobernatt')).toEqual({
      title: '',
      artist: 'oktobernatt',
      titleMissing: true,
      status: 'placeholder',
    });
  });

  it.each(['Song name', 'Track name', 'Now Playing', 'Unknown track'])(
    'adopts the placeholder title %s',
    (value) => {
      expect(sanitizeMetadata(value, 'Someone')).toEqual({
        title: '',
        artist: 'Someone',
        titleMissing: true,
        status: 'placeholder',
      });
    }
  );

  it('reads a duplicated title/artist as title-only', () => {
    expect(sanitizeMetadata('howl', 'HOWL')).toEqual({
      title: 'howl',
      artist: UNKNOWN_ARTIST,
      titleMissing: false,
      status: 'duplicate',
    });
  });

  it('parses a combined "Artist - Title" title when the artist is absent', () => {
    expect(sanitizeMetadata('howl - the family crest', null)).toEqual({
      title: 'the family crest',
      artist: 'howl',
      titleMissing: false,
      splitFrom: 'howl - the family crest',
      status: 'ok',
    });
  });

  it('keeps only the first split segment as the artist', () => {
    expect(sanitizeMetadata('sabada - filous - remix', '')).toEqual({
      title: 'filous - remix',
      artist: 'sabada',
      titleMissing: false,
      splitFrom: 'sabada - filous - remix',
      status: 'ok',
    });
  });

  it('does not split when the artist is already present and does not match either half', () => {
    expect(sanitizeMetadata('Left - Right', 'Artist')).toEqual({
      title: 'Left - Right',
      artist: 'Artist',
      titleMissing: false,
      status: 'ok',
    });
  });

  // Spec 17, W4/RC5: a known artist repeated in the title must be stripped
  // before the query is built (no "nirvana breed nirvana" pollution).
  it('splits an "Artist - Title" title when the artist is already present', () => {
    expect(sanitizeMetadata('Nirvana - Breed', 'Nirvana')).toEqual({
      title: 'Breed',
      artist: 'Nirvana',
      titleMissing: false,
      splitFrom: 'Nirvana - Breed',
      status: 'ok',
    });
  });

  it('splits a "Title - Artist" title when the artist is already present', () => {
    expect(sanitizeMetadata('Breed - Nirvana', 'Nirvana')).toEqual({
      title: 'Breed',
      artist: 'Nirvana',
      titleMissing: false,
      splitFrom: 'Breed - Nirvana',
      status: 'ok',
    });
  });

  it('matches the repeated artist case-insensitively and accent-insensitively', () => {
    expect(sanitizeMetadata('NIRVÁNA - Breed', 'nirvana')).toEqual({
      title: 'Breed',
      artist: 'nirvana',
      titleMissing: false,
      splitFrom: 'NIRVÁNA - Breed',
      status: 'ok',
    });
  });

  it('returns the deliberate fallback for a genuinely missing artist', () => {
    expect(sanitizeMetadata('Rasa', null)).toEqual({
      title: 'Rasa',
      artist: UNKNOWN_ARTIST,
      titleMissing: false,
      status: 'ok',
    });
    expect(sanitizeMetadata('Rasa', '   ')).toEqual({
      title: 'Rasa',
      artist: UNKNOWN_ARTIST,
      titleMissing: false,
      status: 'ok',
    });
  });

  it('treats a placeholder artist as missing', () => {
    expect(sanitizeMetadata('Rasa', 'Unknown Artist')).toEqual({
      title: 'Rasa',
      artist: UNKNOWN_ARTIST,
      titleMissing: false,
      status: 'ok',
    });
  });

  it('does not split when the combined title has an empty artist segment', () => {
    expect(sanitizeMetadata('Rasa - ', '')).toEqual({
      title: 'Rasa -',
      artist: UNKNOWN_ARTIST,
      titleMissing: false,
      status: 'ok',
    });
  });

  // Only a genuinely empty reading keeps the previous track (spec 17, W2).
  it('returns null only for a reading with neither a title nor an artist', () => {
    expect(sanitizeMetadata('', '')).toBeNull();
    expect(sanitizeMetadata(null, null)).toBeNull();
    expect(sanitizeMetadata('   ', '   ')).toBeNull();
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
    expect(sanitizeMetadata(title, artist)).toEqual({
      title,
      artist,
      titleMissing: false,
      status: 'ok',
    });
  });
});

// The debug terminal must be able to explain *why* a reading was dropped
// (spec 17, W1).
describe('inspectMetadata', () => {
  it('reports the accepted pair', () => {
    expect(inspectMetadata('Rasa', 'oktobernatt')).toEqual({
      ok: true,
      title: 'Rasa',
      artist: 'oktobernatt',
      titleMissing: false,
      status: 'ok',
    });
  });

  it('reports a missing title', () => {
    const result = inspectMetadata('', 'Chevelle');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('missing-title');
    expect(result.titleMissing).toBe(true);
    expect(result.artist).toBe('Chevelle');
  });

  it('reports a placeholder title', () => {
    const result = inspectMetadata('Unknown Track', 'Chevelle');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('placeholder');
    expect(result.titleMissing).toBe(true);
  });

  it('reports a duplicated title/artist as title-only', () => {
    const result = inspectMetadata('Much The Same', 'Much The Same');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('duplicate');
    expect(result.title).toBe('Much The Same');
    expect(result.artist).toBe(UNKNOWN_ARTIST);
  });

  it('reports an empty reading as not ok', () => {
    const result = inspectMetadata('', '');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('empty-reading');
  });
});

// Round-4 W2: never drop tracks, adopt missing titles, read title==artist as title-only
describe('W2 adoption (never drop)', () => {
  it('adopts a reading with missing title', () => {
    expect(sanitizeMetadata('', 'Chevelle')).toEqual({
      title: '',
      artist: 'Chevelle',
      titleMissing: true,
      status: 'missing-title',
    });
    expect(sanitizeMetadata(null, 'Chevelle')).toEqual({
      title: '',
      artist: 'Chevelle',
      titleMissing: true,
      status: 'missing-title',
    });
  });

  it('adopts a reading with placeholder title', () => {
    expect(sanitizeMetadata('Unknown Track', 'Chevelle')).toEqual({
      title: '',
      artist: 'Chevelle',
      titleMissing: true,
      status: 'placeholder',
    });
  });

  it('treats title==artist as title-only with unknown artist', () => {
    expect(sanitizeMetadata('Much The Same', 'Much The Same')).toEqual({
      title: 'Much The Same',
      artist: UNKNOWN_ARTIST,
      titleMissing: false,
      status: 'duplicate',
    });
    expect(sanitizeMetadata('HOWL', 'howl')).toEqual({
      title: 'HOWL',
      artist: UNKNOWN_ARTIST,
      titleMissing: false,
      status: 'duplicate',
    });
  });
});
