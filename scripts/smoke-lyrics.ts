import { Song } from '../src/types/lyrics';
import { fetchLyrics } from '../src/services/lyricsService';
import { getCacheStats, clearLyricsCache } from '../src/services/lyricsCache';

const TRACK: Song = {
  id: 'smoke-yesterday-beatles',
  title: 'Yesterday',
  artist: 'The Beatles',
  album: 'Help!',
  albumArt: '',
  durationMs: 125000,
};

async function measure(label: string, useCache: boolean): Promise<number> {
  const start = Date.now();
  const result = await fetchLyrics(TRACK, { useCache });
  const elapsed = Date.now() - start;
  if (!result) {
    throw new Error(`${label} returned no lyrics (not found)`);
  }
  const lines = result.syncedLyrics.length;
  const plain = result.plainLyrics.split('\n').filter((l) => l.trim()).length;
  console.log(
    `  ${label.padEnd(34)} ${String(elapsed).padStart(6)} ms  (provider: ${result.provider}, synced: ${lines}, plain: ${plain})`
  );
  if (lines === 0 && plain === 0) {
    throw new Error(`${label} returned no lyrics`);
  }
  return elapsed;
}

async function main(): Promise<void> {
  console.log('Lyrics smoke-verification: Yesterday - The Beatles (provider chain live)\n');
  console.log('Cold pass (cache disabled, forces network):');
  const cold = await measure('fetchLyrics useCache=false', false);
  console.log('Warm passes (cache enabled):');
  await measure('fetchLyrics useCache=true (miss)', true);
  const warmHit = await measure('fetchLyrics useCache=true (hit)', true);

  console.log('\nCache stats:', JSON.stringify(getCacheStats()));
  if (warmHit >= cold) {
    console.log('RESULT: FAIL - warm cache hit was not faster than cold fetch');
    process.exitCode = 1;
  } else {
    console.log(`RESULT: PASS - cache hit ${cold - warmHit}ms faster than cold fetch`);
  }

  clearLyricsCache();
}

main().catch((err) => {
  console.error('Smoke verification failed:', err);
  process.exitCode = 1;
});