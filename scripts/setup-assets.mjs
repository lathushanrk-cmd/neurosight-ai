/** One-time asset installation. After success, no CDN or network is needed at runtime. */
import { mkdir, readdir, copyFile, stat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const wasmSource = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = join(root, 'public/wasm');
const modelDest = join(root, 'public/models/face_landmarker.task');
const expectedHash = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const modelUrls = [
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'https://github.com/sanderdesnaijer/mediapipe-model-mirrors/releases/download/v1/face_landmarker.task'
];
const sha = b => createHash('sha256').update(b).digest('hex');

async function downloadModel() {
  try {
    const existing = await readFile(modelDest);
    if (sha(existing) === expectedHash) { console.log('[NEUROSIGHT] Verified face landmark model already present.'); return; }
    console.warn('[NEUROSIGHT] Existing model failed checksum; downloading verified replacement.');
  } catch { /* Not installed yet. */ }
  for (const url of modelUrls) {
    for (let i = 0; i < 2; i++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (sha(buffer) !== expectedHash) throw new Error(`Unexpected SHA-256: ${sha(buffer)}; refusing an unverified model`);
        await writeFile(modelDest, buffer);
        console.log(`[NEUROSIGHT] Downloaded verified local face model (${(buffer.length / 1048576).toFixed(1)} MiB).`);
        return;
      } catch (e) {
        console.warn(`[NEUROSIGHT] Model download attempt failed: ${e.message}`);
        await delay(500);
      }
    }
  }
  throw new Error('\nCould not download MediaPipe model. Internet access is needed once during setup. Try "npm run setup:assets" later. Or manually download the official face_landmarker.task into public/models/. The application will not claim working eye tracking without this model.\n');
}

async function main() {
  await mkdir(wasmDest, { recursive: true });
  await mkdir(join(root, 'public/models'), { recursive: true });
  const files = (await readdir(wasmSource)).filter(f => /\.(wasm|js|data)$/.test(f));
  if (!files.some(f => f.endsWith('.wasm'))) throw new Error('MediaPipe WASM files missing in node_modules. Run npm install first.');
  for (const file of files) await copyFile(join(wasmSource, file), join(wasmDest, file));
  console.log(`[NEUROSIGHT] Copied ${files.length} MediaPipe WASM runtime files locally.`);
  await downloadModel();
  const modelSize = (await stat(modelDest)).size;
  if (modelSize < 1_000_000) throw new Error('Invalid Face Landmarker model: too small');
  console.log('[NEUROSIGHT] Setup complete. Camera frames and measurements stay in this browser.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
