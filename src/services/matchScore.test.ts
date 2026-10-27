import { describe, expect, it } from 'vitest';
import {
  levenshteinSimilarity,
  tokenSetSimilarity,
  similarity,
  passesIdentityGate,
  evaluateIdentityGate,
  MIN_IDENTITY_SCORE,
} from './matchScore';

describe('levenshteinSimilarity', () => {
  it('scores identical strings 1 and disjoint strings low', () => {
    expect(levenshteinSimilarity('espresso', 'espresso')).toBe(1);
    expect(levenshteinSimilarity('', '')).toBe(1);
    expect(levenshteinSimilarity('abc', 'xyz')).toBe(0);
  });

  it('tolerates small edits proportionally to length', () => {
    expect(levenshteinSimilarity('espresso', 'espreso')).toBeCloseTo(1 - 1 / 8, 5);
    expect(levenshteinSimilarity('yesterday', 'yestrday')).toBeCloseTo(1 - 1 / 9, 5);
  });
});

describe('tokenSetSimilarity', () => {
  it('scores token containment 1 regardless of order or extra tokens', () => {
    expect(tokenSetSimilarity('tum hi ho', 'tum hi ho')).toBe(1);
    expect(tokenSetSimilarity('tum hi', 'tum hi ho')).toBe(1);
    expect(tokenSetSimilarity('hi tum', 'tum hi')).toBe(1);
  });

  it('scores partial overlap by the smaller set', () => {
    expect(tokenSetSimilarity('tum hi', 'tum bye')).toBeCloseTo(0.5, 5);
    expect(tokenSetSimilarity('a b', 'c d')).toBe(0);
  });

  it('handles empty inputs', () => {
    expect(tokenSetSimilarity('', '')).toBe(1);
    expect(tokenSetSimilarity('', 'abc')).toBe(0);
  });
});

describe('similarity', () => {
  it('takes the better of the two metrics over normalized text', () => {
    expect(similarity('Espresso (Remastered 2011)', 'espresso')).toBe(1);
    expect(similarity('Tum Hi Ho', 'tum hi ho')).toBe(1);
    expect(similarity('Beyoncé', 'Beyonce')).toBe(1);
    expect(similarity('Yesterday', 'Yesterday - Remastered 2011')).toBe(1);
  });

  it('scores genuinely different songs below the identity threshold', () => {
    expect(similarity('Yesterday', 'Bohemian Rhapsody')).toBeLessThan(MIN_IDENTITY_SCORE);
    expect(similarity('Espresso', 'Good Luck, Babe!')).toBeLessThan(MIN_IDENTITY_SCORE);
  });

  it('tolerates small drift around the threshold boundary', () => {
    // One-character drift stays well above 0.8 for reasonable lengths.
    expect(similarity('Espresso', 'Espreso')).toBeGreaterThanOrEqual(MIN_IDENTITY_SCORE);
  });
});

describe('passesIdentityGate', () => {
  it('accepts decorated variants of the same song', () => {
    expect(passesIdentityGate('Espresso (Remastered 2011)', 'Sabrina Carpenter', 'Espresso', 'Sabrina Carpenter')).toBe(true);
    expect(passesIdentityGate('Song [Explicit]', 'Artist X', 'Song', 'Artist X')).toBe(true);
    expect(passesIdentityGate('Song (feat. Artist X)', 'Artist X', 'Song', 'Artist X')).toBe(true);
    expect(passesIdentityGate('Yesterday', 'The Beatles', 'Yesterday - Remastered', 'The Beatles')).toBe(true);
  });

  it('rejects a different song even when duration or order would have matched', () => {
    expect(passesIdentityGate('Completely Different', 'Someone Else', 'Yesterday', 'The Beatles')).toBe(false);
    expect(passesIdentityGate('Yesterday', 'The Beatles', 'Bohemian Rhapsody', 'Queen')).toBe(false);
  });

  it('rejects on artist mismatch even when the title matches', () => {
    expect(passesIdentityGate('Yesterday', 'Other Artist', 'Yesterday', 'The Beatles')).toBe(false);
  });

  it('scores title-only when the query artist is the Unknown Artist placeholder', () => {
    expect(passesIdentityGate('Some Song', '', 'Some Song', 'Unknown Artist')).toBe(true);
    expect(passesIdentityGate('Some Song', '', 'Some Song', '')).toBe(true);
    expect(passesIdentityGate('Other Song', '', 'Some Song', 'Unknown Artist')).toBe(false);
  });

  it('uses the documented threshold constant', () => {
    expect(MIN_IDENTITY_SCORE).toBe(0.8);
  });
});

// The debug terminal reports why a provider candidate was discarded (spec 17).
describe('evaluateIdentityGate', () => {
  it('reports the scores of an accepted candidate', () => {
    const result = evaluateIdentityGate(
      'Espresso (Remastered 2011)',
      'Sabrina Carpenter',
      'Espresso',
      'Sabrina Carpenter'
    );
    expect(result.passed).toBe(true);
    expect(result.rejection).toBeUndefined();
    expect(result.titleScore).toBeGreaterThanOrEqual(MIN_IDENTITY_SCORE);
    expect(result.artistScore).toBeGreaterThanOrEqual(MIN_IDENTITY_SCORE);
  });

  it('reports a title mismatch', () => {
    const result = evaluateIdentityGate('Bohemian Rhapsody', 'Queen', 'Yesterday', 'The Beatles');
    expect(result.passed).toBe(false);
    expect(result.rejection).toBe('title-mismatch');
    expect(result.titleScore).toBeLessThan(MIN_IDENTITY_SCORE);
  });

  it('reports an artist mismatch', () => {
    const result = evaluateIdentityGate('Yesterday', 'Other Artist', 'Yesterday', 'The Beatles');
    expect(result.passed).toBe(false);
    expect(result.rejection).toBe('artist-mismatch');
    expect(result.titleScore).toBeGreaterThanOrEqual(MIN_IDENTITY_SCORE);
    expect(result.artistScore).toBeLessThan(MIN_IDENTITY_SCORE);
  });

  it('does not score the artist when the query artist is unknown', () => {
    const result = evaluateIdentityGate('Some Song', '', 'Some Song', 'Unknown Artist');
    expect(result.passed).toBe(true);
    expect(result.artistScore).toBeNull();
  });

  // Spec 17, W4: the gate is tiered. With no title to check, the artist is the
  // identity that decides (the artist-only query variant).
  it('does not score the title when the query title is unknown', () => {
    const result = evaluateIdentityGate('The Red', 'Chevelle', '', 'Chevelle');
    expect(result.passed).toBe(true);
    expect(result.titleScore).toBeNull();
    expect(result.artistScore).toBeGreaterThanOrEqual(MIN_IDENTITY_SCORE);
  });

  it('rejects a candidate of another artist when the query title is unknown', () => {
    const result = evaluateIdentityGate('The Red', 'Someone Else', '', 'Chevelle');
    expect(result.passed).toBe(false);
    expect(result.rejection).toBe('artist-mismatch');
    expect(result.titleScore).toBeNull();
  });

  it('agrees with passesIdentityGate', () => {
    const cases: Array<[string, string, string, string]> = [
      ['Espresso (Remastered 2011)', 'Sabrina Carpenter', 'Espresso', 'Sabrina Carpenter'],
      ['Completely Different', 'Someone Else', 'Yesterday', 'The Beatles'],
      ['Yesterday', 'Other Artist', 'Yesterday', 'The Beatles'],
      ['Some Song', '', 'Some Song', 'Unknown Artist'],
      ['The Red', 'Chevelle', '', 'Chevelle'],
      ['The Red', 'Someone Else', '', 'Chevelle'],
    ];
    for (const [candidateTitle, candidateArtist, queryTitle, queryArtist] of cases) {
      expect(evaluateIdentityGate(candidateTitle, candidateArtist, queryTitle, queryArtist).passed).toBe(
        passesIdentityGate(candidateTitle, candidateArtist, queryTitle, queryArtist)
      );
    }
  });
});
