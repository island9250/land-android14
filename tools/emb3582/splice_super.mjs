import fs from 'fs';
import path from 'path';

const [stockSuper, slicesDir, outSuper] = process.argv.slice(2);
if (!stockSuper || !slicesDir || !outSuper) throw new Error('usage: node splice_super.mjs <stock-super.img> <slices-dir> <out-super.img>');
const layout = JSON.parse(fs.readFileSync(new URL('./super_layout.json', import.meta.url), 'utf8'));
if (!fs.existsSync(outSuper)) fs.copyFileSync(stockSuper, outSuper);
const outFd = fs.openSync(outSuper, 'r+');
const CH = 8 << 20;
for (const [name, { offset, size }] of Object.entries(layout)) {
  const src = path.join(slicesDir, name + '.img');
  if (fs.statSync(src).size !== size) throw new Error(`${name}: size mismatch`);
  const inFd = fs.openSync(src, 'r');
  const buf = Buffer.alloc(CH);
  let pos = 0;
  while (pos < size) {
    const n = Math.min(CH, size - pos);
    fs.readSync(inFd, buf, 0, n, pos);
    fs.writeSync(outFd, buf, 0, n, offset + pos);
    pos += n;
  }
  fs.closeSync(inFd);
  console.log(`spliced ${name} @0x${offset.toString(16)}`);
}
fs.fsyncSync(outFd);
fs.closeSync(outFd);
