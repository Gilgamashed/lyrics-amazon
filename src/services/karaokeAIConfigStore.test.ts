import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_KARAOKE_AI_MODEL,
  clearKaraokeAIConfig,
  getKaraokeAIConfig,
  isKaraokeAIConfigured,
  loadKaraokeAIConfig,
  saveKaraokeAIConfig,
} from './karaokeAIConfigStore';

describe('karaokeAIConfigStore', () => {
  beforeEach(() => {
    localStorage.clear();
    clearKaraokeAIConfig();
  });

  it('defaults to an empty endpoint and the default model', () => {
    const config = loadKaraokeAIConfig();
    expect(config.endpointUrl).toBe('');
    expect(config.model).toBe(DEFAULT_KARAOKE_AI_MODEL);
    expect(config.apiKey).toBe('');
  });

  it('persists endpoint + model but never the api key', () => {
    saveKaraokeAIConfig({
      endpointUrl: 'https://api.example.com/v1',
      model: 'whisper-1',
      apiKey: 'sk-secret',
    });

    const raw = localStorage.getItem('lyrics-amazon:karaoke-ai:v1');
    expect(raw).toContain('https://api.example.com/v1');
    expect(raw).toContain('whisper-1');
    expect(raw).not.toContain('sk-secret');

    // The key stays available in-memory for this session.
    expect(getKaraokeAIConfig().apiKey).toBe('sk-secret');
  });

  it('reloads the persisted endpoint + model while keeping the session key', () => {
    saveKaraokeAIConfig({
      endpointUrl: 'https://api.example.com/v1',
      model: 'whisper-large-v3',
      apiKey: 'sk-secret',
    });

    const reloaded = loadKaraokeAIConfig();
    expect(reloaded.endpointUrl).toBe('https://api.example.com/v1');
    expect(reloaded.model).toBe('whisper-large-v3');
    expect(reloaded.apiKey).toBe('sk-secret');
  });

  it('trims values and falls back to the default model when blank', () => {
    const config = saveKaraokeAIConfig({
      endpointUrl: '  https://api.example.com/v1  ',
      model: '   ',
      apiKey: '  sk  ',
    });
    expect(config.endpointUrl).toBe('https://api.example.com/v1');
    expect(config.model).toBe(DEFAULT_KARAOKE_AI_MODEL);
    expect(config.apiKey).toBe('sk');
  });

  it('clears everything including the session key', () => {
    saveKaraokeAIConfig({ endpointUrl: 'https://x', model: 'm', apiKey: 'k' });
    clearKaraokeAIConfig();
    const config = getKaraokeAIConfig();
    expect(config.endpointUrl).toBe('');
    expect(config.apiKey).toBe('');
    expect(localStorage.getItem('lyrics-amazon:karaoke-ai:v1')).toBeNull();
  });

  it('reports configured only when endpoint, model and key are all present', () => {
    expect(
      isKaraokeAIConfigured({ endpointUrl: 'u', model: 'm', apiKey: 'k' })
    ).toBe(true);
    expect(isKaraokeAIConfigured({ endpointUrl: '', model: 'm', apiKey: 'k' })).toBe(false);
    expect(isKaraokeAIConfigured({ endpointUrl: 'u', model: '', apiKey: 'k' })).toBe(false);
    expect(isKaraokeAIConfigured({ endpointUrl: 'u', model: 'm', apiKey: '' })).toBe(false);
  });

  it('handles missing localStorage gracefully when reading', () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('unavailable');
      },
      configurable: true,
    } as unknown as Storage);
    const config = loadKaraokeAIConfig();
    expect(config.endpointUrl).toBe('');
    expect(config.model).toBe(DEFAULT_KARAOKE_AI_MODEL);
    Object.defineProperty(window, 'localStorage', {
      value: original,
      configurable: true,
    } as unknown as Storage);
  });

  it('handles storage errors when reading/writing/clearing', () => {
    const original = window.localStorage;
    const bad: Storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
      clear: () => {},
      key: () => null,
      length: 0,
    };
    Object.defineProperty(window, 'localStorage', {
      value: bad,
      configurable: true,
    } as unknown as Storage);

    const loaded = loadKaraokeAIConfig();
    expect(loaded.endpointUrl).toBe('');
    const saved = saveKaraokeAIConfig({ endpointUrl: 'u', model: 'm', apiKey: 'k' });
    expect(saved.apiKey).toBe('k');
    expect(() => clearKaraokeAIConfig()).not.toThrow();

    Object.defineProperty(window, 'localStorage', {
      value: original,
      configurable: true,
    } as unknown as Storage);
  });
});
