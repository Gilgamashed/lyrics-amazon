/**
 * Configuration for the user-triggered AI karaoke pipeline (capture → align).
 *
 * The alignment endpoint URL and model name are non-secret and persisted in
 * localStorage so the user only enters them once. The API key **never** touches
 * disk: it is held in a module-level variable for the current session only and
 * is empty again after a reload, matching the deferred keychain-storage decision
 * (`specs/05_SPEC_AIFALLBACK.md` §5).
 */

export interface KaraokeAIConfig {
  endpointUrl: string;
  model: string;
  apiKey: string;
}

const STORAGE_KEY = 'lyrics-amazon:karaoke-ai:v1';

/** Sensible default for an OpenAI-compatible transcription endpoint. */
export const DEFAULT_KARAOKE_AI_MODEL = 'whisper-1';

interface PersistedKaraokeAIConfig {
  endpointUrl: string;
  model: string;
}

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function defaults(): PersistedKaraokeAIConfig {
  return { endpointUrl: '', model: DEFAULT_KARAOKE_AI_MODEL };
}

function readPersisted(): PersistedKaraokeAIConfig {
  if (!storageAvailable()) return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<PersistedKaraokeAIConfig>;
    return {
      endpointUrl: typeof parsed?.endpointUrl === 'string' ? parsed.endpointUrl : '',
      model:
        typeof parsed?.model === 'string' && parsed.model.trim()
          ? parsed.model
          : DEFAULT_KARAOKE_AI_MODEL,
    };
  } catch {
    return defaults();
  }
}

// Session-only holder so the apiKey is available to the alignment service
// without ever being serialized.
let current: KaraokeAIConfig = { ...defaults(), apiKey: '' };

/** Loads the persisted endpoint/model, preserving any in-memory session key. */
export function loadKaraokeAIConfig(): KaraokeAIConfig {
  current = { ...readPersisted(), apiKey: current.apiKey };
  return { ...current };
}

export function getKaraokeAIConfig(): KaraokeAIConfig {
  return { ...current };
}

/** Normalizes a partial update and persists the non-secret fields. */
export function saveKaraokeAIConfig(
  updates: Partial<KaraokeAIConfig>
): KaraokeAIConfig {
  current = {
    endpointUrl: (updates.endpointUrl ?? current.endpointUrl).trim(),
    model: (updates.model ?? current.model).trim() || DEFAULT_KARAOKE_AI_MODEL,
    apiKey: (updates.apiKey ?? current.apiKey).trim(),
  };

  if (storageAvailable()) {
    try {
      const persisted: PersistedKaraokeAIConfig = {
        endpointUrl: current.endpointUrl,
        model: current.model,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Quota exceeded or storage disabled — keep the in-memory config.
    }
  }

  return { ...current };
}

export function clearKaraokeAIConfig(): void {
  current = { ...defaults(), apiKey: '' };
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** True when the pipeline has everything it needs to run. */
export function isKaraokeAIConfigured(config: KaraokeAIConfig): boolean {
  return Boolean(
    config.endpointUrl.trim() && config.model.trim() && config.apiKey.trim()
  );
}
