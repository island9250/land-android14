import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { parseFdt, getProp } from './fdt_lib.mjs';

const pkg = process.argv[2];
if (!pkg) throw new Error('usage: node verify_package.mjs <package-dir>');
const lines = fs.readFileSync(path.join(pkg, 'package-file'), 'utf8').split(/\r?\n/);
const required = [];
for (const line of lines) {
  const s = line.trim();
  if (!s || s.startsWith('#')) continue;
  const cols = s.split(/\s+/);
  if (cols.length < 2) throw new Error('bad package-file line: ' + line);
  required.push(cols[1]);
}
for (const rel of required) {
  const p = path.join(pkg, rel);
  if (!fs.existsSync(p)) throw new Error('missing package file: ' + rel);
  console.log('file ok', rel, fs.statSync(p).size);
}

const boot = fs.readFileSync(path.join(pkg, 'boot.img'));
if (boot.toString('latin1', 0, 8) !== 'ANDROID!') throw new Error('boot magic mismatch');
const bootId = boot.subarray(0x240, 0x254).toString('hex');
if (bootId !== '3866b46dfca30876b7337d9589dce8b73b00b45d') throw new Error('boot id mismatch: ' + bootId);
let end = 0x40;
while (boot[end]) end++;
const cmdline = boot.toString('utf8', 0x40, end);
if (!cmdline.includes('console=ttyFIQ0')) throw new Error('boot console mismatch');
console.log('boot ok', bootId, 'console=ttyFIQ0');

const uboot = fs.readFileSync(path.join(pkg, 'uboot.img'));
const fit = parseFdt(uboot);
const images = fit.root.children.find((c) => c.name === 'images');
const node = images.children.find((c) => c.name === 'uboot');
const pos = getProp(node, 'data-position').value.readUInt32BE(0);
const size = getProp(node, 'data-size').value.readUInt32BE(0);
const bin = zlib.gunzipSync(uboot.subarray(pos, pos + size));
if (!bin.includes(Buffer.from('board_name=nanopi6\0', 'latin1'))) throw new Error('uboot stock env missing');
if (bin.includes(Buffer.from('reboot_mode=normal\0', 'latin1'))) throw new Error('uboot normal override must be absent');
console.log('uboot ok board_name=nanopi6, reboot_mode=normal absent');

const superSize = fs.statSync(path.join(pkg, 'super.img')).size;
if (superSize !== 3355443200) throw new Error('super size mismatch: ' + superSize);
console.log('super ok', superSize);
console.log('PACKAGE_VERIFY_OK');
