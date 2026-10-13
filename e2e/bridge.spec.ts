import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HTTP = 'http://127.0.0.1:48765';

test.describe('Native bridge protocol against the real binary', () => {
  test('serves a healthy status endpoint', async () => {
    await expect
      .poll(
        async () => (await fetch(`${HTTP}/health`)).ok,
        { timeout: 15_000 }
      )
      .toBe(true);
    const body = await (await fetch(`${HTTP}/health`)).text();
    expect(body.length).toBeGreaterThan(0);
  });

  test('exposes a now-playing snapshot over HTTP', async ({ page }) => {
    await page.goto('/');
    let snapshot: Record<string, unknown> | null = null;
    await expect
      .poll(async () => {
        try {
          const res = await fetch(`${HTTP}/now-playing`);
          if (!res.ok) return false;
          const body = (await res.json()) as Record<string, unknown>;
          if (typeof body.source === 'string') {
            snapshot = body;
            return true;
          }
        } catch {
          // Not ready yet.
        }
        return false;
      }, { timeout: 15_000 })
      .toBe(true);

    expect(snapshot).not.toBeNull();
    // The snapshot must have a playable payload (title present or explicit pause).
    const hasTitle = typeof snapshot!.title === 'string';
    expect(hasTitle || snapshot!.isPlaying === false).toBe(true);
  });

  test('streams distinct now-playing snapshots over websocket', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
      const titles = await page.evaluate(
        () =>
          new Promise<string[]>((resolvePromise) => {
            const ws = new WebSocket('ws://127.0.0.1:48765/ws');
            const seen: string[] = [];
            const timer = setTimeout(() => {
              ws.close();
              resolvePromise(seen);
            }, 45_000);

            ws.onmessage = (event) => {
              try {
                const frame = JSON.parse(event.data as string) as { title?: string };
                if (frame.title && !seen.includes(frame.title)) {
                  seen.push(frame.title);
                  if (new Set(seen).size >= 3) {
                    clearTimeout(timer);
                    ws.close();
                    resolvePromise(seen);
                  }
                }
              } catch {
                // Ignore non-JSON frames.
              }
            };
          })
      );

      // The 60s scripted loop guarantees at least one transition to observe.
      expect(new Set(titles).size).toBeGreaterThanOrEqual(2);
      expect(titles).toContain('Espresso');
  });
});

test.describe('Graceful degradation', () => {
  test('the GUI falls back to browser detection when the bridge dies', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Desktop (native)')).toBeVisible({ timeout: 20_000 });

    const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
    const pidFile = join(root, 'test-results', 'bridge.pid');
    const pid = readFileSync(pidFile, 'utf8').trim();
    expect(pid).not.toBe('');
    spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });

    // WS close → onConnectionChange('disconnected') → Browser badge.
    await expect(page.getByText('Browser (Media Session)')).toBeVisible({ timeout: 15_000 });
  });
});