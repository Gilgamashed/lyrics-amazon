import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

/**
 * Builds the real Tauri bridge binary and starts it with a scripted mock
 * source so the E2E suite can observe native playback detection end-to-end.
 */
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RUST_ROOT = join(ROOT, 'src-tauri');
const EXE = join(
  RUST_ROOT,
  'target',
  'debug',
  'amazon-music-floating-lyrics-bridge.exe'
);
const SCRIPT = join(ROOT, 'e2e', 'fixtures', 'bridge-mock-script.json');
const RESULTS = join(ROOT, 'test-results');
const PID_FILE = join(RESULTS, 'bridge.pid');
const PORT = 48765;
const HEALTH = `http://127.0.0.1:${PORT}/health`;

function log(message: string): void {
  console.log(`[global-setup] ${message}`);
}

function killPidFile(): void {
  const prev = readFileSync(PID_FILE, 'utf8').trim();
  if (!prev) return;
  try {
    spawnSync('taskkill', ['/pid', prev, '/T', '/F'], { stdio: 'ignore' });
    log(`killed stale bridge pid ${prev}`);
  } catch {
    // Already gone.
  }
}

function killPortOwner(): void {
  const out = spawnSync('netstat', ['-ano', '-p', 'tcp']).stdout?.toString() ?? '';
  const seen = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes(`:${PORT}`) || !line.includes('LISTENING')) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (pid && pid !== '0' && !seen.has(pid)) {
      seen.add(pid);
      try {
        spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
        log(`killed stale listener pid ${pid} on :${PORT}`);
      } catch {
        // Already gone.
      }
    }
  }
}

export default async function globalSetup(): Promise<void> {
  mkdirSync(RESULTS, { recursive: true });

  if (existsSync(PID_FILE)) killPidFile();
  killPortOwner();

  log('building debug bridge binary (cargo build, incremental)...');
  const cargoBin = join(process.env.USERPROFILE ?? '', '.cargo', 'bin');
  const env = { ...process.env, PATH: `${cargoBin};${process.env.PATH ?? ''}` };
  const res = spawnSync('cargo', ['build'], {
    cwd: RUST_ROOT,
    env,
    stdio: 'inherit',
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`cargo build failed (status ${res.status})`);
  }

  log(`spawning bridge: ${EXE}`);
  const child = spawn(EXE, [], {
    env: {
      ...process.env,
      BRIDGE_MOCK_SCRIPT: SCRIPT,
      RUST_LOG: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  writeFileSync(PID_FILE, String(child.pid));

  child.on('exit', (code) => {
    log(`bridge process exited (code ${code})`);
    if (existsSync(PID_FILE)) writeFileSync(PID_FILE, '');
  });

  let stderrBuf = '';
  child.stderr?.on('data', (chunk) => {
    stderrBuf += String(chunk);
  });

  // Wait for the bridge health endpoint.
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(HEALTH);
      if (res.ok) {
        log('bridge is healthy on 127.0.0.1:48765');
        return;
      }
    } catch {
      // Not up yet.
    }
    if (Date.now() - started > 30_000) {
      child.kill();
      throw new Error(`bridge did not become healthy within 30s\n--- bridge stderr ---\n${stderrBuf}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}