import React from 'react';
import { AlertCircle, Music2, RotateCcw } from 'lucide-react';
import { LookupOutcome, describeOutcome, isTransientOutcome } from '../services/lookupOutcome';

interface EmptyLyricsStateProps {
  /** How the lookup ended (spec 17, W3). */
  outcome?: LookupOutcome;
  /** Re-runs the lookup; the Retry action is only offered when present. */
  onRetry?: () => void;
  /** Wording used for a genuine "no lyrics anywhere" result. */
  notFoundDetail?: string;
}

/**
 * The empty lyrics state (spec 17, W3).
 *
 * "No lyrics" has three distinct causes and they must not be shown the same
 * way: a genuine miss, a temporary provider failure (Retry), and a provider
 * answer whose candidates all failed the identity check. A transient failure
 * is never reported as "Lyrics not found".
 */
export const EmptyLyricsState: React.FC<EmptyLyricsStateProps> = ({
  outcome,
  onRetry,
  notFoundDetail,
}) => {
  const copy = describeOutcome(outcome);
  const transient = isTransientOutcome(outcome);
  const detail = !transient && outcome === 'not-found' && notFoundDetail ? notFoundDetail : copy.detail;
  const showRetry = Boolean(onRetry) && (transient || outcome === 'gate-rejected');

  return (
    <div
      className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center select-none"
      data-testid="empty-lyrics-state"
      data-outcome={outcome ?? 'not-found'}
    >
      {transient ? (
        <AlertCircle className="w-8 h-8 text-amber-400 mb-3" />
      ) : (
        <Music2 className="w-8 h-8 text-slate-500 mb-3" />
      )}
      <p className="text-sm font-semibold text-slate-200">{copy.title}</p>
      <p className="text-xs text-slate-500 mt-1">{detail}</p>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          data-testid="retry-lookup"
          className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
};
