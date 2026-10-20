import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIConfig, Song } from '../types/lyrics';
import { isAIConfigured, resolveAIConfig, synthesizeLyrics } from './aiService';

const SONG: Song = {
  id: 't-1',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  albumArt: '',
  durationMs: 180_000,
};

const CONFIG: AIConfig = {
  providerUrl: 'https://llm.example.com/v1',
  model: 'gpt-test',
  apiKey: 'sk-test',
  enabled: true,
};

function jsonOk(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

describe('resolveAIConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers session settings over environment', () => {
    vi.stubEnv('VITE_AI_PROVIDER_URL', 'https://env.example/v1');
    vi.stubEnv('VITE_AI_MODEL', 'env-model');

    const config = resolveAIConfig({
      providerUrl: 'https://session.example/v1',
      model: 'session-model',
      apiKey: '  sk-session  ',
      enabled: true,
    });

    expect(config.providerUrl).toBe('https://session.example/v1');
    expect(config.model).toBe('session-model');
    expect(config.apiKey).toBe('sk-session');
    expect(config.enabled).toBe(true);
  });

  it('falls back to environment for url/model but never reads the key from env', () => {
    vi.stubEnv('VITE_AI_PROVIDER_URL', '  https://env.example/v1  ');
    vi.stubEnv('VITE_AI_MODEL', 'env-model');
    vi.stubEnv('VITE_AI_API_KEY', 'env-baked-key');

    const config = resolveAIConfig({ apiKey: 'sk-session' });
    expect(config.providerUrl).toBe('https://env.example/v1');
    expect(config.model).toBe('env-model');
    expect(config.apiKey).toBe('sk-session');
    expect(config.enabled).toBe(true);
  });

  it('disables when the session key is missing even if env provides everything else', () => {
    vi.stubEnv('VITE_AI_PROVIDER_URL', 'https://env.example/v1');
    vi.stubEnv('VITE_AI_MODEL', 'env-model');

    const config = resolveAIConfig({});
    expect(config.enabled).toBe(false);
    expect(config.apiKey).toBe('');
  });

  it('respects explicit disable and null/undefined sessions', () => {
    expect(resolveAIConfig({ ...CONFIG, enabled: false }).enabled).toBe(false);
    expect(resolveAIConfig(null).enabled).toBe(false);
    expect(resolveAIConfig(undefined).enabled).toBe(false);
    expect(resolveAIConfig({ enabled: true }).enabled).toBe(false);
  });
});

describe('isAIConfigured', () => {
  it('requires providerUrl, model, apiKey and enabled', () => {
    expect(isAIConfigured(CONFIG)).toBe(true);
    expect(isAIConfigured({ ...CONFIG, apiKey: '' })).toBe(false);
    expect(isAIConfigured({ ...CONFIG, providerUrl: '  ' })).toBe(false);
    expect(isAIConfigured({ ...CONFIG, model: '' })).toBe(false);
    expect(isAIConfigured({ ...CONFIG, enabled: false })).toBe(false);
  });
});

describe('synthesizeLyrics', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null without fetching when not configured or title is empty', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    expect(await synthesizeLyrics(SONG, { ...CONFIG, enabled: false })).toBeNull();
    expect(await synthesizeLyrics({ ...SONG, title: '  ' }, CONFIG)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts to {providerUrl}/chat/completions and parses a payload', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonOk({
        choices: [
          {
            message: {
              content: JSON.stringify({
                lines: [
                  { timeMs: 3000, text: 'Second line', section: 'verse' },
                  { timeMs: 1000, text: 'First line', section: 'intro' },
                  { timeMs: 2000, text: '', section: 'garbage' },
                ],
                annotations: [
                  { lineRef: 'First line', header: 'Note', content: 'About the intro' },
                  { lineRef: 'missing line', header: 'Skip', content: 'No match' },
                  { lineRef: 'x', header: 'Empty', content: '   ' },
                ],
                trivia: ['Fact one', '', '  ', 'Fact two'],
              }),
            },
          },
        ],
      })
    );

    const result = await synthesizeLyrics(SONG, CONFIG);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('AI Sync');
    expect(result!.syncedLyrics).toHaveLength(2);
    // Sorted ascending and ids re-assigned independently of input order.
    expect(result!.syncedLyrics.map((l) => l.startTimeMs)).toEqual([1000, 3000]);
    expect(result!.syncedLyrics[0].id).toBe('ai-line-0');
    expect(result!.syncedLyrics[1].id).toBe('ai-line-1');
    // Invalid sections are dropped.
    expect(result!.syncedLyrics.every((l) => (l.section as string) !== 'garbage')).toBe(true);

    // Only the matching annotation with non-empty content is linked.
    expect(result!.annotations).toHaveLength(1);
    expect(result!.syncedLyrics[0].annotationId).toBe('ai-ann-0');
    expect(result!.trivia).toEqual(['Fact one', 'Fact two']);

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(url)).toBe('https://llm.example.com/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('gpt-test');
    expect(body.messages).toHaveLength(2);
    // The prompt must embed the song/duration rules (title normalized per spec 16).
    expect(body.messages[1].content).toContain('test song');
    expect(body.messages[1].content).toContain('180');
  });

  it('strips markdown fences from the JSON content', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonOk({
        choices: [
          {
            message: {
              content: '```json\n{"lines":[{"timeMs":10,"text":"A"}]}\n```',
            },
          },
        ],
      })
    );

    const result = await synthesizeLyrics(SONG, CONFIG);
    expect(result!.syncedLyrics.map((l) => l.text)).toEqual(['A']);
  });

  it('returns null on missing/invalid content, arrays, and empty lines', async () => {
    const fetch = vi.mocked(globalThis.fetch);

    fetch.mockResolvedValue(jsonOk({ choices: [{ message: { content: '{"bogus":true}' } }] }));
    expect(await synthesizeLyrics(SONG, CONFIG)).toBeNull();

    fetch.mockResolvedValue(jsonOk({ choices: [{ message: { content: 42 } }] }));
    expect(await synthesizeLyrics(SONG, CONFIG)).toBeNull();

    fetch.mockResolvedValue(jsonOk({ choices: [{ message: { content: '{"lines":[]}' } }] }));
    expect(await synthesizeLyrics(SONG, CONFIG)).toBeNull();

    fetch.mockResolvedValue(jsonOk({ choices: [] }));
    expect(await synthesizeLyrics(SONG, CONFIG)).toBeNull();

    fetch.mockResolvedValue(jsonOk({ choices: [{ message: {} }] }));
    expect(await synthesizeLyrics(SONG, CONFIG)).toBeNull();
  });

  it('returns null on non-OK responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false, status: 429 } as Response);
    expect(await synthesizeLyrics(SONG, CONFIG)).toBeNull();
  });

  it('returns null when the network request throws', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Network down'));
    expect(await synthesizeLyrics(SONG, CONFIG)).toBeNull();
  });

  it('aborts the request after the default timeout', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(globalThis.fetch).mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            (init as RequestInit).signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      );

      const pending = synthesizeLyrics(SONG, CONFIG);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});