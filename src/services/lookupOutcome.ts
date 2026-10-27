/**
 * Lookup outcome classification (spec 17, W3).
 *
 * "No lyrics" is not one thing. A provider may have answered that the song is
 * genuinely absent from its catalogue (`not-found`), answered with a transient
 * failure such as HTTP 503 (`transient-error`), or returned candidates that
 * every one failed the identity gate (`gate-rejected`). Only the first is a
 * real "this song has no lyrics"; the second must offer a Retry and the third
 * must never be reported as a plain miss.
 *
 * The classification travels with the provider result, is aggregated by the
 * chain, and is surfaced by the UI so the diagnostics terminal and the user
 * see the same verdict.
 */

export type LookupOutcome = 'found' | 'not-found' | 'transient-error' | 'gate-rejected';

/** True when the failure was temporary and a retry may succeed. */
export function isTransientOutcome(outcome: LookupOutcome | undefined): boolean {
  return outcome === 'transient-error';
}

export interface OutcomeCopy {
  title: string;
  detail: string;
}

/** User-facing copy for the empty lyrics panel, per outcome. */
export function describeOutcome(outcome: LookupOutcome | undefined): OutcomeCopy {
  switch (outcome) {
    case 'transient-error':
      return {
        title: 'Providers are temporarily unavailable',
        detail: 'The lyrics sources did not answer. This is a temporary failure, not a missing song.',
      };
    case 'gate-rejected':
      return {
        title: 'Results did not match this track',
        detail: 'The providers answered, but every candidate failed the identity check.',
      };
    case 'found':
      return { title: 'Lyrics found', detail: '' };
    default:
      return {
        title: 'Lyrics not found',
        detail: 'No lyrics were found across any provider for this track.',
      };
  }
}
