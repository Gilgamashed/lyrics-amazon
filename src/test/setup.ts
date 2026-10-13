import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// jsdom shims (the jsdom environment does not implement these by default).
// ---------------------------------------------------------------------------

const noop = () => undefined;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16);
  window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class implements ResizeObserver {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = noop as () => void;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = noop as (pointerId: number) => void;
  Element.prototype.releasePointerCapture = noop as (pointerId: number) => void;
}

// Minimal PointerEvent shim used by the floating-window drag/resize handlers.
class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 1;
    this.pointerType = params.pointerType ?? 'mouse';
    this.isPrimary = params.isPrimary ?? true;
  }
}

if (!window.PointerEvent) {
  window.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
}

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => undefined },
    configurable: true,
  });
}

// Default WebSocket stub so components that create bridge clients are harmless
// unless a test explicitly replaces it with a scripted mock.
class WebSocketStub {
  static instances: WebSocketStub[] = [];
  url: string;
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    WebSocketStub.instances.push(this);
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({});
  }
}

if (!window.WebSocket) {
  Object.defineProperty(window, 'WebSocket', {
    value: WebSocketStub,
    configurable: true,
    writable: true,
  });
}