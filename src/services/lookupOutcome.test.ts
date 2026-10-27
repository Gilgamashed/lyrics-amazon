import { describe, expect, it } from 'vitest';
import { describeOutcome, isTransientOutcome, LookupOutcome } from './lookupOutcome';

describe('lookupOutcome', () => {
  it('treats only transient-error as retryable', () => {
    const outcomes: LookupOutcome[] = ['found', 'not-found', 'transient-error', 'gate-rejected'];
    expect(outcomes.filter(isTransientOutcome)).toEqual(['transient-error']);
    expect(isTransientOutcome(undefined)).toBe(false);
  });

  it('describes a found result without empty-state wording', () => {
    expect(describeOutcome('found')).toEqual({ title: 'Lyrics found', detail: '' });
  });

  it('describes a genuine miss', () => {
    expect(describeOutcome('not-found').title).toBe('Lyrics not found');
    expect(describeOutcome(undefined).title).toBe('Lyrics not found');
  });

  it('describes a transient failure and never calls it a miss', () => {
    const copy = describeOutcome('transient-error');
    expect(copy.title).toBe('Providers are temporarily unavailable');
    expect(copy.title).not.toBe('Lyrics not found');
  });

  it('describes a gate rejection separately from a miss', () => {
    expect(describeOutcome('gate-rejected').title).toBe('Results did not match this track');
  });
});
