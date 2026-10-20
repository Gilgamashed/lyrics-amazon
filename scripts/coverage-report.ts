import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Combined coverage gate for Phase 7 (specs/07_SPEC_TESTING.md §6).
 *   1. Runs the Vitest suite with coverage (writes coverage/coverage-summary.json).
 *   2. Runs `cargo llvm-cov --json` for the Rust bridge.
 *   3. Merges the line-counts of both and fails (exit 1) if the combined line
 *      coverage is below the hard gate of 85%.
 *
 * Allowed exclusions (only):
*  - src/main.tsx               (Vite entry, no logic)
 *  - all *.test.ts / *.test.tsx (test code itself)
 *  - src/test/**                (test harness/fixtures)
 *  - src-tauri/src/main.rs      (binary entry, superseded by lib.rs)
 *  - src-tauri/build.rs         (build script)
 *  - src-tauri/gen/             (generated scaffolding)
 */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RUST_ROOT = join(ROOT, 'src-tauri');
const FE_SUMMARY = join(ROOT, 'coverage', 'coverage-summary.json');
const GATE_PCT = 85;

/**
 * Files where a regression is especially costly (the lyrics retrieval core and
 * the play-history scorer), held to a strict 100% line-coverage gate.
 */
const CRITICAL_FILES = [
  'src/services/lrcParser.ts',
  'src/services/httpClient.ts',
  'src/services/providers/chain.ts',
  'src/services/providers/base.ts',
  'src/services/providers/genius.ts',
  'src/services/providers/lrclib.ts',
  'src/services/providers/lyrica.ts',
  'src/services/lyricsService.ts',
  'src/services/lyricsCache.ts',
  'src/services/textNormalize.ts',
  'src/services/matchScore.ts',
  'src/services/karaokeAlignService.ts',
  'src/services/karaokeAIConfigStore.ts',
  'src/services/captureService.ts',
  'src/services/playHistoryStore.ts',
  'src/services/playbackClock.ts',
  'src/services/latestRequest.ts',
  'src/services/metaOverrideStore.ts',
  'src/services/metadataSanitizer.ts',
];

const RUST_EXCLUDES = [/[/\\]src-tauri[/\\]src[/\\]main\.rs$/, /[/\\]src-tauri[/\\]build\.rs$/, /[/\\]src-tauri[/\\]gen[/\\]/];

interface LineCount {
  total: number;
  covered: number;
}

function run(cmd: string, args: string[], cwd: string): { status: number; stdout: string } {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: false });
  return { status: res.status ?? -1, stdout: res.stdout ?? '' };
}

function runFrontend(): void {
  const bin = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  const res = run(process.execPath, [bin, 'run', '--coverage'], ROOT);
  if (res.status !== 0) {
    console.error('[coverage-report] Vitest run failed.');
    process.exit(1);
  }
}

function readFrontendCoverage(): { files: Record<string, LineCount>; total: LineCount } {
  if (!existsSync(FE_SUMMARY)) {
    console.error(`[coverage-report] Missing ${FE_SUMMARY} — did Vitest coverage run?`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(FE_SUMMARY, 'utf8')) as Record<
    string,
    { lines: { total: number; covered: number } }
  >;

  const files: Record<string, LineCount> = {};
  const total: LineCount = { total: 0, covered: 0 };

  for (const [file, block] of Object.entries(raw)) {
    if (file === 'total') {
      total.total += block.lines.total;
      total.covered += block.lines.covered;
      continue;
    }
    const lc: LineCount = { total: block.lines.total, covered: block.lines.covered };
    files[file] = lc;
    total.total += lc.total;
    total.covered += lc.covered;
  }
  return { files, total };
}

function readRustCoverage(): { files: Record<string, LineCount>; total: LineCount } {
  const cargoBin = join(process.env.USERPROFILE ?? '', '.cargo', 'bin');
  const pathEnv = process.env.PATH ? `${cargoBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` : cargoBin;
  const res = spawnSync(
    'cargo',
    ['llvm-cov', '--json'],
    { cwd: RUST_ROOT, encoding: 'utf8', env: { ...process.env, PATH: pathEnv }, maxBuffer: 64 * 1024 * 1024 }
  );
  if (res.status !== 0) {
    console.error(`[coverage-report] cargo llvm-cov failed (${res.status}):`);
    console.error(res.stderr ?? '');
    process.exit(1);
  }

  interface ExportRecord {
    data: Array<{ files: Array<{ filename: string; summary: { lines: { count: number; covered: number } } }> }>;
  }
  const parsed = JSON.parse(res.stdout ?? '') as ExportRecord;

  const files: Record<string, LineCount> = {};
  const total: LineCount = { total: 0, covered: 0 };

  for (const entry of parsed.data ?? []) {
    for (const file of entry.files ?? []) {
      if (RUST_EXCLUDES.some((re) => re.test(file.filename))) continue;
      const lc: LineCount = { total: file.summary.lines.count, covered: file.summary.lines.covered };
      files[file.filename] = lc;
      total.total += lc.total;
      total.covered += lc.covered;
    }
  }
  return { files, total };
}

function pct(c: LineCount): string {
  return c.total === 0 ? '—' : ((c.covered / c.total) * 100).toFixed(2) + '%';
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function main(): void {
  runFrontend();

  const fe = readFrontendCoverage();
  const rs = readRustCoverage();

  const allEntries: Array<[string, LineCount, 'ts' | 'rs']> = [
    ...Object.entries(fe.files).map(([k, v]) => [k, v, 'ts'] as [string, LineCount, 'ts' | 'rs']),
    ...Object.entries(rs.files).map(([k, v]) => [k, v, 'rs'] as [string, LineCount, 'rs' | 'ts']),
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const fePct = pct(fe.total);
  const rsPct = pct(rs.total);
  const combined: LineCount = {
    total: fe.total.total + rs.total.total,
    covered: fe.total.covered + rs.total.covered,
  };
  const combinedPct = pct(combined);

  console.log('');
  console.log('Combined coverage report (Phase 7 gate: ≥85% lines)');
  console.log(''.padEnd(80, '-'));
  console.log(`${pad('Suite', 34)}${pad('Lines', 10)}${pad('Covered', 10)}${'Pct'}`.padEnd(80, ' '));
  console.log(''.padEnd(80, '-'));
  console.log(`${pad('Frontend (TypeScript)', 34)}${pad(String(fe.total.total), 10)}${pad(String(fe.total.covered), 10)}${fePct}`);
  console.log(`${pad('Rust bridge (LLVM)', 34)}${pad(String(rs.total.total), 10)}${pad(String(rs.total.covered), 10)}${rsPct}`);
  console.log(`${pad('COMBINED', 34)}${pad(String(combined.total), 10)}${pad(String(combined.covered), 10)}${combinedPct}`);
  console.log(''.padEnd(80, '-'));
  console.log('');
  console.log('Per-file detail:');
  console.log(`${pad('File', 70)}${pad('Lines', 10)}${'Pct'}`);
  console.log(''.padEnd(80, '-'));
  for (const [file, lc, lang] of allEntries) {
    console.log(`${pad(`${lang} · ${file.replace(ROOT, '')}`, 70)}${pad(String(lc.total), 10)}${pct(lc)}`);
  }
  console.log(''.padEnd(80, '-'));
  console.log('');

  const gate = combined.total > 0 && (combined.covered / combined.total) * 100 >= GATE_PCT;
  console.log(`Combined line coverage: ${combinedPct}  (gate: ≥${GATE_PCT}%)`);
  console.log(`Frontend: ${fePct} (${fe.total.covered}/${fe.total.total} lines)`);
  console.log(`Rust: ${rsPct} (${rs.total.covered}/${rs.total.total} lines)`);

  if (!gate) {
    console.error(`[coverage-report] FAIL — combined coverage below ${GATE_PCT}%.`);
    process.exit(1);
  }

  console.log('');
  console.log('Critical-file gate (100% lines):');
  let criticalOk = true;
  for (const rel of CRITICAL_FILES) {
    const entry = Object.entries(fe.files).find(([file]) =>
      file.replace(/\\/g, '/').endsWith(rel)
    );
    if (!entry) {
      console.error(`  MISSING ${rel} — not present in the coverage report.`);
      criticalOk = false;
      continue;
    }
    const lc = entry[1];
    const ok = lc.total > 0 && lc.covered === lc.total;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${rel} (${lc.covered}/${lc.total} lines)`);
    if (!ok) criticalOk = false;
  }

  if (!criticalOk) {
    console.error('[coverage-report] FAIL — a critical file is below 100% line coverage.');
    process.exit(1);
  }
  console.log('[coverage-report] PASS — combined coverage ≥85% and all critical files at 100%.');
}

main();