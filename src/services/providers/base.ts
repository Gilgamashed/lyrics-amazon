import { LyricLine } from '../../types/lyrics';

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u00E0-\u00E6]/g, 'a')
    .replace(/[\u00E7]/g, 'c')
    .replace(/[\u00E8-\u00EB]/g, 'e')
    .replace(/[\u00EC-\u00EF]/g, 'i')
    .replace(/[\u00F2-\u00F6]/g, 'o')
    .replace(/[\u00F9-\u00FC]/g, 'u')
    .replace(/[\u00F1]/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))
  );
}

export function extractPlain(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

export function linesToPlain(lines: LyricLine[]): string {
  return lines.map((l) => l.text).join('\n');
}

export interface LinkedSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

/**
 * Builds an abort signal that fires on a per-request timeout, an external abort
 * (e.g. a superseded lyrics load), or either. `cleanup` must be called exactly
 * once to clear the timer and detach the external listener.
 */
export function withTimeoutSignal(timeoutMs: number, external?: AbortSignal): LinkedSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort);
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      external?.removeEventListener('abort', onAbort);
    },
  };
}
