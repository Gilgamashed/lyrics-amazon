/**
 * Bounded HTTP retry for provider requests (spec 17, W3).
 *
 * Providers fail transiently: LRCLIB answers HTTP 503 `ServerOverload` under
 * load and 429 when it throttles, and both are *not* "this song has no
 * lyrics". Every provider request therefore goes through `fetchWithRetry`,
 * which retries the retryable statuses with a bounded backoff and reports how
 * many attempts were made, so the caller can classify the failure as
 * transient instead of swallowing it into an empty result.
 *
 * A non-retryable status (404, 400, ...) is returned to the caller untouched
 * after a single attempt, and an aborted request is never retried.
 */

import { httpFetch } from './httpClient';
import { debugLog } from './debugConsole';

/** Statuses that mean "try again", not "this song is not here". */
export const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_MS = [400, 900];

export interface RetryOptions {
  /** Aborts the request; an aborted request is never retried. */
  signal?: AbortSignal;
  maxAttempts?: number;
  /** Backoff before attempt n+1; the last entry is reused when exhausted. */
  backoffMs?: number[];
  /** Short provider label used in the diagnostics events. */
  label: string;
}

export interface RetryReport {
  /** The last response, or `null` when the request never produced one. */
  response: Response | null;
  attempts: number;
  /** Total wall-clock time of all attempts. */
  ms: number;
  /** True when the failure is transient (retryable status or a network error). */
  transient: boolean;
  error?: string;
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Performs `url` and retries the retryable statuses with a bounded backoff.
 *
 * Throws only when the request was aborted; every other failure is reported
 * through the returned report so the caller can classify it.
 */
export async function fetchWithRetry(url: string, options: RetryOptions): Promise<RetryReport> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const startedAt = Date.now();

  let attempts = 0;
  let lastError: string | undefined;

  while (attempts < maxAttempts) {
    if (options.signal?.aborted) break;
    attempts += 1;
    const attemptStartedAt = Date.now();

    try {
      const response = await httpFetch(url, { signal: options.signal });
      const retryable = isRetryableStatus(response.status);
      const willRetry = retryable && attempts < maxAttempts;

      debugLog(
        'provider',
        'http.attempt',
        {
          label: options.label,
          url,
          status: response.status,
          attempt: attempts,
          ms: Date.now() - attemptStartedAt,
          willRetry,
        },
        response.ok ? 'debug' : 'warn'
      );

      if (!retryable || !willRetry) {
        return {
          response,
          attempts,
          ms: Date.now() - startedAt,
          transient: retryable,
        };
      }

      await sleep(backoff[attempts - 1] ?? backoff[backoff.length - 1] ?? 0, options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      const willRetry = attempts < maxAttempts;

      debugLog(
        'provider',
        'http.attempt',
        {
          label: options.label,
          url,
          attempt: attempts,
          error: lastError,
          ms: Date.now() - attemptStartedAt,
          willRetry,
        },
        'warn'
      );

      if (!willRetry) break;
      await sleep(backoff[attempts - 1] ?? 0, options.signal);
    }
  }

  return {
    response: null,
    attempts,
    ms: Date.now() - startedAt,
    transient: true,
    error: lastError,
  };
}
