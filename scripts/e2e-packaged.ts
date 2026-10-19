/**
 * Packaged-app E2E release gate (spec 15).
 *
 * Drives the *release* binary from `src-tauri/target/release/` through
 * `tauri-driver` + `msedgedriver` (WebDriver — the WebView2 webview is not
 * CDP-attachable, so Playwright cannot drive it). House style of the smoke-*
 * scripts: run with `npm run test:e2e:packaged`.
 *
 * Prerequisites (run before every tag cut):
 *   npm run tauri:build -- --no-bundle   release exe; --no-bundle skips the
 *                                        signed updater artifacts
 *   cargo install tauri-driver           or set TAURI_DRIVER=<path-to-exe>
 *
 * msedgedriver matching the host WebView2 runtime is resolved from the
 * registry and downloaded/cached under `test-results/msedgedriver/<version>/`
 * automatically (both locally and on CI runners).
 *
 * Checks (spec 15 §3.3):
 *   1. the app launches and the main window renders (version annotation)
 *   2. the packaged process serves /health on 48765
 *   3. with BRIDGE_MOCK_SCRIPT the UI shows the Desktop (native) badge and a
 *      mock track title
 *   4. a second launch exits promptly while the first stays healthy
 *      (single-instance, real-process proof)
 *   5. startup reaches a usable state with the update check completing
 *      quietly (during gating the test channel serves an equal/older version
 *      or 404s, so the updater stays quiet by design)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder, By, Capabilities, type WebDriver } from 'selenium-webdriver';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RUST_ROOT = join(ROOT, 'src-tauri');
const RELEASE_DIR = join(RUST_ROOT, 'target', 'release');
const RESULTS = join(ROOT, 'test-results');
const SCRIPT = join(ROOT, 'e2e', 'fixtures', 'bridge-mock-script.json');
const WEBVIEW_DIR = join(RESULTS, 'webview-packaged');
const DRIVER_CACHE = join(RESULTS, 'msedgedriver');
const PORT = 48765;
const HEALTH = `http://127.0.0.1:${PORT}/health`;
const WEBDRIVER_URL = 'http://127.0.0.1:4444/';
const WEBVIEW2_CLIENT_GUID = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function log(message: string): void {
  console.log(`[e2e-packaged] ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function resolveReleaseExe(): string {
  const preferred = [
    join(RELEASE_DIR, 'Amazon Music Floating Lyrics.exe'),
    join(RELEASE_DIR, 'amazon-music-floating-lyrics-bridge.exe'),
  ];
  for (const candidate of preferred) {
    if (existsSync(candidate)) return candidate;
  }
  const exes = existsSync(RELEASE_DIR)
    ? readdirSync(RELEASE_DIR).filter((name) => name.endsWith('.exe'))
    : [];
  if (exes.length === 1) return join(RELEASE_DIR, exes[0]);
  fail(
    `could not locate the release exe in ${RELEASE_DIR} (found: ${exes.join(', ') || 'none'}). ` +
      'Build it first: npm run tauri:build -- --no-bundle'
  );
}

function resolveTauriDriver(): string {
  const fromEnv = process.env.TAURI_DRIVER;
  if (fromEnv) {
    if (!existsSync(fromEnv)) fail(`TAURI_DRIVER points to a missing file: ${fromEnv}`);
    return fromEnv;
  }
  const cargoBin = join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'tauri-driver.exe');
  if (existsSync(cargoBin)) return cargoBin;
  const which = spawnSync('where', ['tauri-driver'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  fail('tauri-driver not found. Install it with: cargo install tauri-driver (or set TAURI_DRIVER=<path>)');
}

function powershell(command: string): string {
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
  });
  return (res.stdout ?? '').trim();
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * WebView2 evergreen runtime version. The authoritative source is the versioned
 * directory under the WebView2 install root — the registry `EdgeUpdate\Clients`
 * entries can be absent or (worse) hold the *Edge browser* version, which makes
 * msedgedriver silently mis-match the runtime and fail with
 * "DevToolsActivePort file doesn't exist".
 */
function resolveWebViewVersion(): string {
  const installRoots = [
    'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application',
    join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'EdgeWebView', 'Application'),
  ];
  for (const root of installRoots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root).filter((name) => /^\d+(\.\d+){3}$/.test(name));
    if (versions.length > 0) {
      const version = versions.sort(compareVersions).at(-1) as string;
      log(`WebView2 runtime ${version} (from ${root})`);
      return version;
    }
  }
  const registryReads: Array<[string, string]> = [
    [`HKLM:\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT_GUID}`, 'WebView2 runtime (HKLM)'],
    [`HKLM:\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT_GUID}`, 'WebView2 runtime (HKLM 64-bit)'],
    [`HKCU:\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT_GUID}`, 'WebView2 runtime (HKCU)'],
  ];
  for (const [key, label] of registryReads) {
    const version = powershell(`(Get-ItemProperty '${key}' -ErrorAction SilentlyContinue).pv`);
    if (version && version !== 'null') {
      log(`WebView2 runtime ${version} (from registry: ${label})`);
      return version;
    }
  }
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (existsSync(edge)) {
    const version = powershell(`(Get-Item '${edge}').VersionInfo.ProductVersion`);
    if (version) {
      log(`falling back to the Edge browser version ${version} (no WebView2 runtime found)`);
      return version;
    }
  }
  fail('could not determine the WebView2/Edge version nor find a WebView2 install; is WebView2 installed?');
}

function ensureMsedgedriver(): string {
  const version = resolveWebViewVersion();
  const dir = join(DRIVER_CACHE, version);
  const exe = join(dir, 'msedgedriver.exe');
  if (existsSync(exe)) {
    log(`msedgedriver ${version} already cached`);
    return exe;
  }
  mkdirSync(dir, { recursive: true });
  const url = `https://msedgedriver.microsoft.com/${version}/edgedriver_win64.zip`;
  const zip = join(DRIVER_CACHE, `edgedriver_${version}.zip`);
  log(`downloading msedgedriver ${version} from ${url}`);
  // curl.exe ships with Windows 10+/CI runners; -4 avoids broken IPv6 routes
  // to Microsoft's CDN that hang PowerShell's Invoke-WebRequest.
  const dl = spawnSync('curl.exe', ['-4', '-sSL', '--fail', '-o', zip, url], {
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (dl.status !== 0 || !existsSync(zip)) {
    fail(`failed to download msedgedriver ${version}: ${dl.stderr ?? 'unknown error'}`);
  }
  const extract = spawnSync('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Expand-Archive -Path '${zip}' -DestinationPath '${dir}' -Force`,
  ], { encoding: 'utf8' });
  rmSync(zip, { force: true });
  if (extract.status !== 0 || !existsSync(exe)) {
    fail(`failed to extract msedgedriver: ${extract.stderr ?? 'unknown error'}`);
  }
  return exe;
}

/** Kills whatever listens on the given TCP port (stale bridge / driver). */
function killPortOwner(port: number): void {
  const out = spawnSync('netstat', ['-ano', '-p', 'tcp']).stdout?.toString() ?? '';
  const seen = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (pid && pid !== '0' && !seen.has(pid)) {
      seen.add(pid);
      spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
      log(`killed stale listener pid ${pid} on :${port}`);
    }
  }
}

async function isHealthy(): Promise<boolean> {
  try {
    return (await fetch(HEALTH)).ok;
  } catch {
    return false;
  }
}

/**
 * Failure-path probe: launch the release exe standalone (exactly the env the
 * WebDriver chain passes it) and report whether it can serve /health here at
 * all, plus its exit code and any stderr (Rust panics print to stderr even
 * though release builds have no logger). Distinguishes "the app cannot run on
 * this machine" from "only the msedgedriver launch path fails".
 */
async function diagnoseStandaloneLaunch(exe: string): Promise<string> {
  let report = '\n--- standalone launch probe ---';
  try {
    const child = spawn(exe, [], { env: appEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
    let exitCode: number | null | undefined;
    child.on('exit', (code) => {
      exitCode = code;
    });
    let healthy = false;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (exitCode !== undefined) break;
      if (await isHealthy()) {
        healthy = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    report += `\napp served /health: ${healthy ? 'yes' : 'no'}`;
    report += `\napp exit code: ${exitCode === undefined ? '(still running)' : exitCode}`;
    if (stderr.trim()) report += `\napp stderr: ${stderr.trim()}`;
    if (exitCode === undefined) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      report += '\n(probe process killed)';
    }
  } catch (probeError) {
    report += `\nprobe itself failed: ${String(probeError)}`;
  }
  return report;
}

/** Application event log entries mentioning the exe (crash reports). */
function diagnoseEventLog(exeName: string): string {
  try {
    const events = powershell(
      `Get-WinEvent -LogName Application -MaxEvents 300 -ErrorAction SilentlyContinue | ` +
        `Where-Object { $_.Message -like '*${exeName}*' } | Select-Object -First 2 | ` +
        `ForEach-Object { $_.LevelDisplayName + ': ' + ($_.Message -replace '\\s+', ' ').Substring(0, 300) }`
    );
    return events ? `\nrecent Application events:\n  ${events.replace(/\r?\n/g, '\n  ')}` : '';
  } catch (logError) {
    return `\nevent log read failed: ${String(logError)}`;
  }
}

async function waitForHealthy(timeoutMs: number): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await isHealthy()) return;
    if (Date.now() - started > timeoutMs) fail(`/health on :${PORT} did not respond within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

let driver: WebDriver | undefined;
let tauriDriver: ChildProcess | undefined;
let tauriDriverExited = false;

function appEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BRIDGE_MOCK_SCRIPT: SCRIPT,
    RUST_LOG: 'info',
    WEBVIEW2_USER_DATA_FOLDER: WEBVIEW_DIR,
  };
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    fail('the packaged-app E2E gate is Windows-only (WebView2/msedgedriver)');
  }
  mkdirSync(RESULTS, { recursive: true });
  mkdirSync(WEBVIEW_DIR, { recursive: true });

  const exe = resolveReleaseExe();
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
  log(`release exe: ${exe}`);
  log(`expected version annotation: v${pkg.version}`);

  killPortOwner(PORT);
  killPortOwner(4444);
  killPortOwner(4445);

  const msedgedriver = ensureMsedgedriver();
  const tauriDriverBin = resolveTauriDriver();
  const driverDir = resolve(msedgedriver, '..');

  log(`starting tauri-driver (${tauriDriverBin})`);
  tauriDriver = spawn(tauriDriverBin, [], {
    env: {
      ...appEnv(),
      PATH: `${driverDir};${process.env.PATH ?? ''}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  tauriDriver.on('exit', (code) => {
    tauriDriverExited = true;
    log(`tauri-driver exited (code ${code})`);
  });
  let driverErr = '';
  tauriDriver.stderr?.on('data', (chunk) => {
    driverErr += String(chunk);
  });

  // Wait for the WebDriver server to accept connections.
  const started = Date.now();
  for (;;) {
    if (tauriDriverExited) fail(`tauri-driver exited early: ${driverErr}`);
    try {
      if ((await fetch(WEBDRIVER_URL)).status < 500) break;
    } catch {
      // Not up yet.
    }
    if (Date.now() - started > 30_000) fail(`tauri-driver did not start within 30s: ${driverErr}`);
    await new Promise((r) => setTimeout(r, 250));
  }

  const capabilities = new Capabilities();
  capabilities.set('tauri:options', { application: exe });
  capabilities.setBrowserName('wry');

  let session: WebDriver;
  try {
    session = await new Builder().withCapabilities(capabilities).usingServer(WEBDRIVER_URL).build();
  } catch (error) {
    // Decisive diagnostics for "DevToolsActivePort file doesn't exist": was the
    // app alive, and did WebView2 write the port file anywhere under the
    // user-data folder we isolated it to?
    let diagnostics = '';
    try {
      const entries = readdirSync(WEBVIEW_DIR);
      diagnostics += `\nwebview user-data dir: ${WEBVIEW_DIR}\n  entries: ${entries.join(', ') || '(empty)'}`;
    } catch (readError) {
      diagnostics += `\nwebview user-data dir unreadable: ${String(readError)}`;
    }
    const port = powershell(
      `Get-ChildItem -LiteralPath '${WEBVIEW_DIR}' -Recurse -Force -Filter 'DevToolsActivePort' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName`
    );
    diagnostics += `\nDevToolsActivePort: ${port || 'NOT FOUND'}`;
    const exeName = basename(exe);
    const tasks = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${exeName}`], { encoding: 'utf8' }).stdout ?? '';
    diagnostics += `\napp process (${exeName}): ${tasks.includes(exeName) ? 'running' : 'not running'}`;
    diagnostics += diagnoseEventLog(exeName);
    diagnostics += await diagnoseStandaloneLaunch(exe);
    fail(`could not create the WebDriver session: ${error}\ntauri-driver stderr: ${driverErr}${diagnostics}`);
  }
  driver = session;

  const checks: string[] = [];
  try {
    // Check 1 — the app launches and the main window renders.
    log('check 1: main window renders with the version annotation');
    await session.wait(
      async () => (await session.findElements(By.css('[data-testid="app-version"]'))).length > 0,
      30_000
    );
    const annotation = await session.findElement(By.css('[data-testid="app-version"]')).getText();
    if (annotation.trim() !== `v${pkg.version}`) {
      fail(`version annotation reads "${annotation}", expected "v${pkg.version}"`);
    }
    checks.push(`1. main window rendered, version annotation "${annotation}"`);

    // Check 2 — the packaged process serves /health.
    log('check 2: /health on 48765');
    await waitForHealthy(15_000);
    checks.push('2. packaged process serves /health on 48765');

    // Check 3 — mock-driven detection shows the native badge and a mock title.
    log('check 3: Desktop (native) badge + mock track title');
    const badge = await session.wait(
      async () => {
        const found = await session.findElements(By.xpath("//*[contains(text(), 'Desktop (native)')]"));
        return found.length > 0 ? found[0] : false;
      },
      30_000
    );
    if (!badge) fail('the Desktop (native) detection badge never appeared');
    const mockTitles = ['Espresso', 'Cruel Summer', 'City Lights'];
    let sawTitle = false;
    const titleDeadline = Date.now() + 20_000;
    while (!sawTitle && Date.now() < titleDeadline) {
      const body = await session.findElement(By.tagName('body')).getText();
      sawTitle = mockTitles.some((title) => body.includes(title));
      if (!sawTitle) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!sawTitle) fail(`no mock track title (${mockTitles.join('/')}) appeared in the UI`);
    checks.push('3. Desktop (native) badge and mock track title rendered');

    // Check 4 — a second launch exits promptly while the first stays healthy.
    log('check 4: second launch exits (single-instance) while the first stays healthy');
    const second = spawn(exe, [], { env: appEnv(), stdio: 'ignore' });
    const exited = await new Promise<boolean>((resolveExit) => {
      const timer = setTimeout(() => resolveExit(false), 15_000);
      second.on('exit', () => {
        clearTimeout(timer);
        resolveExit(true);
      });
    });
    if (!exited) {
      second.kill();
      fail('the second launch did not exit within 15s — single-instance guard is not working');
    }
    await waitForHealthy(10_000);
    await session.findElement(By.css('[data-testid="app-version"]'));
    checks.push('4. second launch exited promptly, first instance stayed healthy');

    // Check 5 — startup is usable and the update check completed quietly
    // (during gating the test channel serves an equal/older version or 404s).
    log('check 5: startup settled with a quiet update check');
    await new Promise((r) => setTimeout(r, 5_000));
    await session.findElement(By.css('[data-testid="app-version"]'));
    if (tauriDriverExited) fail(`tauri-driver died during the run: ${driverErr}`);
    checks.push('5. app stayed usable; update check completed without a blocking prompt');
  } finally {
    if (driver) {
      await driver.quit().catch(() => {});
    }
    if (tauriDriver && !tauriDriverExited) tauriDriver.kill();
  }

  for (const check of checks) console.log(`  ${check}`);
  console.log('\nRESULT: PASS - packaged-app E2E gate (5/5 checks)');
}

main().catch((error) => {
  console.error('Packaged-app E2E gate failed:', error instanceof Error ? error.message : error);
  if (driver) void driver.quit().catch(() => {});
  if (tauriDriver && !tauriDriverExited) tauriDriver.kill();
  process.exitCode = 1;
});
