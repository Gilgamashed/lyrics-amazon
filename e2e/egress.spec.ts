import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRIDGE = 'http://127.0.0.1:48765';
const HEALTH = `${BRIDGE}/health`;
const UPSTREAM_BODY = 'bridge-proxied-lyrics-body';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXE = join(ROOT, 'src-tauri', 'target', 'debug', 'amazon-music-floating-lyrics-bridge.exe');
const SCRIPT = join(ROOT, 'e2e', 'fixtures', 'bridge-mock-script.json');
const PID_FILE = join(ROOT, 'test-results', 'bridge.pid');
const WEBVIEW_DIR = join(ROOT, 'test-results', 'webview-egress');

let server: Server | undefined;
let upstreamUrl: string;
let respawned: ChildProcess | null = null;

async function isHealthy(): Promise<boolean> {
  try {
    return (await fetch(HEALTH)).ok;
  } catch {
    return false;
  }
}

/**
 * The "Graceful degradation" suite in bridge.spec.ts deliberately kills the
 * bridge. Bring it back so these egress checks do not depend on file ordering.
 * The respawn uses an isolated WebView2 profile folder: the Tauri binary still
 * creates a (headless) webview, and the just-killed process's default profile
 * folder stays locked for a few seconds ("resource in use" panic 101).
 */
async function ensureBridge(): Promise<void> {
  if (await isHealthy()) return;
  mkdirSync(WEBVIEW_DIR, { recursive: true });
  const child = spawn(EXE, [], {
    env: {
      ...process.env,
      BRIDGE_MOCK_SCRIPT: SCRIPT,
      RUST_LOG: 'info',
      WEBVIEW2_USER_DATA_FOLDER: WEBVIEW_DIR,
    },
    stdio: 'ignore',
  });
  respawned = child;
  let exited = false;
  child.on('exit', (code) => {
    exited = true;
    console.error(`[egress] respawned bridge exited early (code ${code})`);
  });
  const started = Date.now();
  for (;;) {
    if (exited) {
      throw new Error(
        'respawned bridge exited before becoming healthy (single-instance lock or port 48765 likely held by another instance — close the running app / tauri dev and retry)'
      );
    }
    if (await isHealthy()) {
      if (child.pid) writeFileSync(PID_FILE, String(child.pid));
      return;
    }
    if (Date.now() - started > 30_000) {
      throw new Error('bridge did not become healthy within 30s after respawn');
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

test.beforeAll(async () => {
  await ensureBridge();
  const upstream = createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    // Deliberately NO Access-Control-Allow-Origin, like genius.com in a browser.
    res.end(UPSTREAM_BODY);
  });
  await new Promise<void>((resolvePromise) => upstream.listen(0, '127.0.0.1', resolvePromise));
  server = upstream;
  const { port } = upstream.address() as AddressInfo;
  upstreamUrl = `http://127.0.0.1:${port}/lyrics`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolvePromise) => server!.close(() => resolvePromise()));
  }
  if (respawned?.pid) {
    spawnSync('taskkill', ['/pid', String(respawned.pid), '/T', '/F'], { stdio: 'ignore' });
  }
});

test.describe('Lyrics egress proxy (spec 11)', () => {
  test('a direct cross-origin fetch is CORS-blocked, but the bridge /fetch returns the body', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. The page cannot read a no-CORS upstream directly.
    const direct = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url);
        return `ok:${res.status}`;
      } catch {
        return 'blocked';
      }
    }, upstreamUrl);
    expect(direct).toBe('blocked');

    // 2. The same URL read through the local bridge proxy succeeds.
    const proxied = await page.evaluate(
      async ({ bridge, url }) => {
        const res = await fetch(`${bridge}/fetch?url=${encodeURIComponent(url)}`);
        return { ok: res.ok, status: res.status, text: await res.text() };
      },
      { bridge: BRIDGE, url: upstreamUrl }
    );
    expect(proxied.ok).toBe(true);
    expect(proxied.status).toBe(200);
    expect(proxied.text).toBe(UPSTREAM_BODY);
  });

  test('the bridge refuses hostnames outside the lyrics allowlist', async ({ page }) => {
    await page.goto('/');
    const status = await page.evaluate(async (bridge) => {
      const res = await fetch(
        `${bridge}/fetch?url=${encodeURIComponent('https://evil.example/steal')}`
      );
      return res.status;
    }, BRIDGE);
    expect(status).toBe(403);
  });
});
