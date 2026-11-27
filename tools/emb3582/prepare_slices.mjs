import fs from 'fs';
import path from 'path';

const [superPath, outDir] = process.argv.slice(2);
if (!superPath || !outDir) throw new Error('usage: node prepare_slices.mjs <super.img> <out-dir>');
const layout = JSON.parse(fs.readFileSync(new URL('./super_layout.json', import.meta.url), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const inFd = fs.openSync(superPath, 'r');
const CH = 8 << 20;
for (const [name, { offset, size }] of Object.entries(layout)) {
  const outFd = fs.openSync(path.join(outDir, name + '.img'), 'w');
  const buf = Buffer.alloc(CH);
  let pos = 0;
  while (pos < size) {
    const n = Math.min(CH, size - pos);
    fs.readSync(inFd, buf, 0, n, offset + pos);
    fs.writeSync(outFd, buf, 0, n);
    pos += n;
  }
  fs.fsyncSync(outFd);
  fs.closeSync(outFd);
  console.log(`prepared ${name} @0x${offset.toString(16)} ${size}`);
}
fs.closeSync(inFd);
