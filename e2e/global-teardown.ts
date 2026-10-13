import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stops the bridge process started by globalSetup.
 */
export default function globalTeardown(): void {
  const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const PID_FILE = join(ROOT, 'test-results', 'bridge.pid');

  if (!existsSync(PID_FILE)) return;
  const pid = readFileSync(PID_FILE, 'utf8').trim();
  if (!pid) return;

  console.log(`[global-teardown] stopping bridge pid ${pid}`);
  const res = spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
  if (res.status !== 0) {
    console.warn(`[global-teardown] taskkill returned ${res.status}; process may already be gone`);
  }
}