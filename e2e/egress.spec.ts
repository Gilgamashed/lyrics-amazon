import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRIDGE = 'http://127.0.0.1:48765';
const HEALTH = `${BRIDGE}/health`;
const UPSTREAM_BODY = 'bridge-proxied-lyrics-body';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXE = join(ROOT, 'src-tauri', 'target', 'debug', 'amazon-music-floating-lyrics-bridge.exe');
const PID_FILE = join(ROOT, 'test-results', 'bridge.pid');

let server: Server;
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
 */
async function ensureBridge(): Promise<void> {
  if (await isHealthy()) return;
  const child = spawn(EXE, [], { stdio: 'ignore' });
  respawned = child;
  const started = Date.now();
  for (;;) {
    if (await isHealthy()) {
      if (child.pid) writeFileSync(PID_FILE, String(child.pid));
      return;
    }
    if (Date.now() - started > 20_000) {
      throw new Error('bridge did not become healthy within 20s after respawn');
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

test.beforeAll(async () => {
  await ensureBridge();
  server = createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    // Deliberately NO Access-Control-Allow-Origin, like genius.com in a browser.
    res.end(UPSTREAM_BODY);
  });
  await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const { port } = server.address() as AddressInfo;
  upstreamUrl = `http://127.0.0.1:${port}/lyrics`;
});

test.afterAll(async () => {
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
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
