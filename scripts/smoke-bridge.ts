import {
  fetchNowPlaying,
  getBridgeHttpUrl,
  getBridgeWsUrl,
} from '../src/services/bridgeService';
import { NowPlaying } from '../src/types/lyrics';

function collectFirstFrame(timeoutMs = 4000): Promise<NowPlaying> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(getBridgeWsUrl());
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for a WebSocket frame`));
    }, timeoutMs);

    socket.onmessage = (event) => {
      clearTimeout(timer);
      socket.close();
      try {
        resolve(JSON.parse(String(event.data)) as NowPlaying);
      } catch (error) {
        reject(new Error(`Bridge sent an unparseable frame: ${String(error)}`));
      }
    };

    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Could not connect to ${getBridgeWsUrl()}`));
    };
  });
}

async function main(): Promise<void> {
  console.log(`Native bridge smoke-verification at ${getBridgeHttpUrl()}\n`);

  const snapshot = await fetchNowPlaying(3000);
  if (!snapshot) {
    throw new Error(
      `No HTTP snapshot from ${getBridgeHttpUrl()}/now-playing. Start the bridge first (npm run tauri:dev) and retry.`
    );
  }
  console.log('HTTP GET /now-playing:');
  console.log(`  source        ${snapshot.source}`);
  console.log(`  title         ${snapshot.title ?? '(idle)'}`);
  console.log(`  artist        ${snapshot.artist ?? '(idle)'}`);
  console.log(`  isPlaying     ${snapshot.isPlaying}`);
  console.log(`  positionMs    ${snapshot.positionMs ?? '(none)'}`);
  console.log(`  durationMs    ${snapshot.durationMs ?? '(none)'}`);

  const frame = await collectFirstFrame();
  console.log('\nWebSocket first frame:');
  console.log(`  ${JSON.stringify(frame)}`);

  if (typeof snapshot.source !== 'string' || typeof snapshot.isPlaying !== 'boolean') {
    console.log('\nRESULT: FAIL - snapshot is missing required NowPlaying fields');
    process.exitCode = 1;
    return;
  }

  console.log('\nRESULT: PASS - bridge reachable over HTTP + WebSocket (idle payload expected when nothing is playing)');
}

main().catch((error) => {
  console.error('Smoke verification failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});