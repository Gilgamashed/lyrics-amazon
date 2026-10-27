import { describe, expect, it } from 'vitest';
import {
  stripReleaseNoise,
  normalizeQueryText,
  identityKey,
  isUnknownArtist,
} from './textNormalize';
import { UNKNOWN_ARTIST } from './metadataSanitizer';

describe('stripReleaseNoise', () => {
  it('removes remaster, deluxe, version and year bracketed segments', () => {
    expect(stripReleaseNoise('Song (Remastered 2011)')).toBe('Song  ');
    expect(stripReleaseNoise('Song [Deluxe Edition]')).toBe('Song  ');
    expect(stripReleaseNoise('Song (2011)')).toBe('Song  ');
    expect(stripReleaseNoise('Song (Album Version)')).toBe('Song  ');
  });

  it('removes unbracketed trailing noise suffixes after a separator', () => {
    expect(stripReleaseNoise('Song - Remastered')).toBe('Song ');
    expect(stripReleaseNoise('Song - Remastered 2011')).toBe('Song ');
    expect(stripReleaseNoise('Song | Live')).toBe('Song ');
    expect(stripReleaseNoise('Song - Explicit')).toBe('Song ');
  });

  it('never strips noise words that are part of the title itself', () => {
    expect(stripReleaseNoise('Alive')).toBe('Alive');
    expect(stripReleaseNoise('Live and Let Die')).toBe('Live and Let Die');
    expect(stripReleaseNoise('Clean')).toBe('Clean');
  });

  it('removes [Explicit] and [Clean] markers', () => {
    expect(stripReleaseNoise('Song [Explicit]')).toBe('Song  ');
    expect(stripReleaseNoise('Song (Clean)')).toBe('Song  ');
  });

  it('removes bracketed and trailing featuring credits', () => {
    expect(stripReleaseNoise('Song (feat. Artist X)')).toBe('Song ');
    expect(stripReleaseNoise('Song [ft. Artist X]')).toBe('Song ');
    expect(stripReleaseNoise('Song feat. Artist X')).toBe('Song ');
    expect(stripReleaseNoise('Song featuring Artist X')).toBe('Song ');
  });

  it('keeps legitimate parenthetical titles intact', () => {
    expect(stripReleaseNoise('(Everything I Do) I Do It for You')).toBe(
      '(Everything I Do) I Do It for You'
    );
    expect(stripReleaseNoise('Who Let the Dogs Out? (Who? Who? Who?)')).toBe(
      'Who Let the Dogs Out? (Who? Who? Who?)'
    );
  });

  it('handles multiple noise segments in one title', () => {
    expect(stripReleaseNoise('Song (Remastered 2011) [Explicit] (Live)')).toBe('Song      ');
  });

  it('leaves clean titles unchanged', () => {
    expect(stripReleaseNoise('Yesterday')).toBe('Yesterday');
    expect(stripReleaseNoise('Tum Hi Ho')).toBe('Tum Hi Ho');
  });
});

describe('normalizeQueryText', () => {
  it('lowercases, folds accents and collapses punctuation', () => {
    expect(normalizeQueryText('Beyoncé - Déjà Vu')).toBe('beyonce deja vu');
    expect(normalizeQueryText('  Multiple   spaces!!  ')).toBe('multiple spaces');
    expect(normalizeQueryText('AC/DC & Friends')).toBe('ac dc friends');
  });

  it('strips release noise before collapsing', () => {
    expect(normalizeQueryText('Espresso (Remastered 2011)')).toBe('espresso');
    expect(normalizeQueryText('Song [Explicit] feat. Artist X')).toBe('song');
    expect(normalizeQueryText('Song - Remastered 2011')).toBe('song');
  });

  it('returns an empty string for blank or noise-only input', () => {
    expect(normalizeQueryText('')).toBe('');
    expect(normalizeQueryText('   ')).toBe('');
    expect(normalizeQueryText('(Live)')).toBe('');
  });

  it('folds non-combining unicode marks (NFD)', () => {
    expect(normalizeQueryText('Sigur Rós - Hoppípolla')).toBe('sigur ros hoppipolla');
    expect(normalizeQueryText('Mötley Crüe')).toBe('motley crue');
  });

  // Spec 17, RC5: a non-Latin title must never normalize away to an empty
  // string - otherwise the lookup would query for nothing at all.
  it('keeps a non-Latin title intact', () => {
    expect(normalizeQueryText('東京事変')).toBe('東京事変');
    expect(normalizeQueryText('椎名林檎')).toBe('椎名林檎');
    expect(normalizeQueryText('Тебе так везде')).toBe('тебе так везде');
    expect(normalizeQueryText('한국어 제목')).toBe('한국어 제목');
  });

  it('strips a trailing feat. credit that has no artist', () => {
    expect(normalizeQueryText('Song feat.')).toBe('song');
    expect(normalizeQueryText('Song ft')).toBe('song');
    expect(normalizeQueryText('Song featuring')).toBe('song');
  });

  it('strips the feat. credit together with the credited artist', () => {
    expect(normalizeQueryText('Song feat. Artist X')).toBe('song');
    expect(normalizeQueryText('Song (feat. Artist X)')).toBe('song');
  });
});

describe('identityKey', () => {
  it('maps decorated and clean readings of the same song to one key', () => {
    expect(identityKey('Espresso (Remastered 2011)', 'Sabrina Carpenter')).toBe(
      identityKey('Espresso', 'sabrina carpenter')
    );
    expect(identityKey('Song [Explicit]', 'Artist X')).toBe(identityKey('Song', 'Artist X'));
  });

  it('keeps different songs on different keys', () => {
    expect(identityKey('Song A', 'Artist')).not.toBe(identityKey('Song B', 'Artist'));
    expect(identityKey('Song', 'Artist A')).not.toBe(identityKey('Song', 'Artist B'));
  });
});

describe('isUnknownArtist', () => {
  it('recognizes the placeholder and blank artists', () => {
    expect(isUnknownArtist(UNKNOWN_ARTIST)).toBe(true);
    expect(isUnknownArtist('unknown artist')).toBe(true);
    expect(isUnknownArtist('')).toBe(true);
    expect(isUnknownArtist('   ')).toBe(true);
  });

  it('rejects real artists', () => {
    expect(isUnknownArtist('The Beatles')).toBe(false);
  });
});
