/**
 * Latest-wins request sequencer for lyrics loads.
 *
 * Each `start()` supersedes the previous in-flight request: it aborts the prior
 * signal and returns a fresh id. Callers must check `isCurrent(id)` before
 * applying a result or clearing the loading flag, so a slow response for track
 * A can never overwrite track B.
 */
export interface RequestHandle {
  id: number;
  signal: AbortSignal;
}

export class LatestRequest {
  private seq = 0;
  private controller: AbortController | null = null;

  start(): RequestHandle {
    this.controller?.abort();
    this.controller = new AbortController();
    return { id: ++this.seq, signal: this.controller.signal };
  }

  isCurrent(id: number): boolean {
    return id === this.seq;
  }

  /** Aborts any in-flight request and invalidates its id. */
  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.seq += 1;
  }
}
