import { describe, expect, it } from 'vitest';
import { extractLyricsFromHtml as extractGenius } from './genius';
import { extractLyrics as extractAzLyrics } from './azlyrics';
import { extractLyrics as extractLetras } from './letras';
import { extractLyrics as extractMusixmatch } from './musixmatch';
import { extractPlain, isAbortError, linesToPlain, normalize } from './base';

describe('provider html extraction', () => {
  it('extracts and decodes Genius lyrics containers', () => {
    const html =
      '<div data-lyrics-container="true">I&#39;m the first line<br/>Second line</div>';
    const lyrics = extractGenius(html);
    expect(lyrics).toContain("I'm the first line");
    expect(lyrics).toContain('Second line');
  });

  it('returns null when Genius markup is absent or too short', () => {
    expect(extractGenius('<html></html>')).toBeNull();
    expect(extractGenius('<div data-lyrics-container="true">hi</div>')).toBeNull();
  });

  it('extracts azlyrics blocks between the license marker and the next div', () => {
    const marker =
      '<!-- Usage of azlyrics.com content by any third-party lyrics provider is prohibited by our licensing agreement. Sorry about that. -->';
    const html = `<div>${marker}<br>First real line<br>Second real line</div>`;
    const lyrics = extractAzLyrics(html);
    expect(lyrics).toContain('First real line');
    expect(lyrics).toContain('Second real line');
  });

  it('returns null for azlyrics without the marker', () => {
    expect(extractAzLyrics('<div>no marker here</div>')).toBeNull();
  });

  it('extracts letras.mus.br lyric-original blocks', () => {
    const html = '<div class="lyric-original"><p>Line one here</p><p>Line two here</p></div>';
    const lyrics = extractLetras(html);
    expect(lyrics).toContain('Line one here');
    expect(lyrics).toContain('Line two here');
  });

  it('extracts musixmatch lyric spans', () => {
    const html =
      '<span class="lyrics__content__ok">First musixmatch line</span><span class="lyrics__content__ok">Second musixmatch line</span>';
    const lyrics = extractMusixmatch(html);
    expect(lyrics).toContain('First musixmatch line');
    expect(lyrics).toContain('Second musixmatch line');
  });

  it('returns null when musixmatch markup is absent', () => {
    expect(extractMusixmatch('<html></html>')).toBeNull();
  });
});

describe('normalize', () => {
  it('strips accents and punctuation to a slug-safe form', () => {
    expect(normalize('Beyoncé - Déjà Vu!')).toBe('beyonce deja vu');
  });

  it('handles the full accented Latin range', () => {
    expect(normalize('Ãõçñíú')).toBe('aocniu');
  });
});

describe('base helpers', () => {
  it('detects abort errors by name or message', () => {
    const byName = Object.assign(new Error('nope'), { name: 'AbortError' });
    expect(isAbortError(byName)).toBe(true);
    expect(isAbortError(new Error('Request aborted by caller'))).toBe(true);
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError('string')).toBe(false);
  });

  it('normalizes plain lyric text', () => {
    expect(extractPlain('')).toBe('');
    expect(extractPlain('a\r\n\r\n  b  \n')).toBe('a\nb');
  });

  it('joins lyric lines back into plain text', () => {
    expect(
      linesToPlain([
        { id: 'a', startTimeMs: 0, text: 'one' },
        { id: 'b', startTimeMs: 1, text: 'two' },
      ])
    ).toBe('one\ntwo');
  });
});
