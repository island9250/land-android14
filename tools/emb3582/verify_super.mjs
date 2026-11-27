import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const [superPath, slicesDir] = process.argv.slice(2);
if (!superPath || !slicesDir) throw new Error('usage: node verify_super.mjs <super.img> <slices-dir>');
const layout = JSON.parse(fs.readFileSync(new URL('./super_layout.json', import.meta.url), 'utf8'));
const superFd = fs.openSync(superPath, 'r');
let ok = true;
for (const [name, { offset, size }] of Object.entries(layout)) {
  const sliceFd = fs.openSync(path.join(slicesDir, name + '.img'), 'r');
  const a = crypto.createHash('sha256');
  const b = crypto.createHash('sha256');
  const CH = 8 << 20;
  const buf1 = Buffer.alloc(CH);
  const buf2 = Buffer.alloc(CH);
  let pos = 0;
  while (pos < size) {
    const n = Math.min(CH, size - pos);
    fs.readSync(sliceFd, buf1, 0, n, pos);
    fs.readSync(superFd, buf2, 0, n, offset + pos);
    a.update(buf1.subarray(0, n));
    b.update(buf2.subarray(0, n));
    pos += n;
  }
  fs.closeSync(sliceFd);
  const ha = a.digest('hex');
  const hb = b.digest('hex');
  const good = ha === hb;
  ok = ok && good;
  console.log(`${name} ${good ? 'OK' : 'MISMATCH'} ${ha}`);
}
fs.closeSync(superFd);
if (!ok) process.exit(1);
console.log('SUPER_VERIFY_OK');
