import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractLyricsFromHtml as extractGenius } from './genius';
import {
  extractPlain,
  isAbortError,
  linesToPlain,
  normalize,
  withTimeoutSignal,
} from './base';

afterEach(() => {
  vi.useRealTimers();
});

describe('genius html extraction', () => {
  it('extracts and decodes a single lyrics container', () => {
    const html =
      '<div data-lyrics-container="true">I&#39;m the first line<br/>Second line</div>';
    const lyrics = extractGenius(html);
    expect(lyrics).toContain("I'm the first line");
    expect(lyrics).toContain('Second line');
  });

  it('keeps nested markup inside a container (does not truncate at the first </div>)', () => {
    const html =
      '<div data-lyrics-container="true"><div class="block">This is Line A here<br/>And this is Line B here</div></div>';
    const lyrics = extractGenius(html);
    expect(lyrics).toContain('This is Line A here');
    expect(lyrics).toContain('And this is Line B here');
  });

  it('joins multiple containers split around ad slots in document order', () => {
    const html =
      '<div data-lyrics-container="true">[Verse 1]<br/>First half</div>' +
      '<div class="ad"></div>' +
      '<div data-lyrics-container="true">[Chorus]<br/>Second half</div>';
    const lyrics = extractGenius(html);
    expect(lyrics?.indexOf('First half')).toBeLessThan(lyrics?.indexOf('Second half') ?? -1);
  });

  it('drops the Contributors/Translations widget and description prefix', () => {
    const html =
      '<div data-lyrics-container="true">' +
      '99 ContributorsTranslationsTürkçeEspañolYesterday Lyrics The most covered song. Read More' +
      '<br/><br/>[Verse 1]<br/>Real lyric one<br/>Real lyric two' +
      '</div>';
    const lyrics = extractGenius(html);
    expect(lyrics).toContain('Real lyric one');
    expect(lyrics).not.toContain('Contributors');
    expect(lyrics).not.toContain('Read More');
  });

  it('decodes numeric and named HTML entities', () => {
    const html =
      '<div data-lyrics-container="true">A &amp; B &#39;quoted&#39; &lt;tag&gt; &#x27;x&#x27;</div>';
    const lyrics = extractGenius(html);
    expect(lyrics).toBe("A & B 'quoted' <tag> 'x'");
  });

  it('returns null when Genius markup is absent or too short', () => {
    expect(extractGenius('<html></html>')).toBeNull();
    expect(extractGenius('<div data-lyrics-container="true">hi</div>')).toBeNull();
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

describe('withTimeoutSignal', () => {
  it('aborts after the timeout elapses', () => {
    vi.useFakeTimers();
    const { signal, cleanup } = withTimeoutSignal(1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it('aborts immediately when the external signal is already aborted', () => {
    const external = new AbortController();
    external.abort();
    const { signal, cleanup } = withTimeoutSignal(1000, external.signal);
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it('follows a later external abort', () => {
    const external = new AbortController();
    const { signal, cleanup } = withTimeoutSignal(60_000, external.signal);
    expect(signal.aborted).toBe(false);
    external.abort();
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it('cleanup clears the timer and detaches the external listener', () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const { signal, cleanup } = withTimeoutSignal(1000, external.signal);
    cleanup();
    vi.advanceTimersByTime(5000);
    external.abort();
    expect(signal.aborted).toBe(false);
  });
});
