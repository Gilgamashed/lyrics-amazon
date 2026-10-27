import { defineConfig } from '@playwright/test';

/**
 * Phase 7 E2E (specs/07_SPEC_TESTING.md).
 *
 * Runs the REAL Tauri bridge binary (built by globalSetup, driven by
 * BRIDGE_MOCK_SCRIPT) side-by-side with the production web app served by
 * `vite preview` after a real `vite build`.
 *
 * NOTE: bundled Chromium downloads are unreliable on this machine
 * (cdn.playwright.dev), so we use the system Chrome via `channel: 'chrome'`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port=4173 --strictPort --host=127.0.0.1',
    // The diagnostics terminal is a development/release-candidate feature; the
    // E2E bundle opts in explicitly so the surface can be exercised.
    env: { VITE_DEBUG_TERMINAL: '1' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});