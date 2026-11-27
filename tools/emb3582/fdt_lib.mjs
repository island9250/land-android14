// Minimal FDT parse / tree edit / serialize (version 17).
const FDT_MAGIC = 0xd00dfeed;

export function parseFdt(buf) {
  if (buf.readUInt32BE(0) !== FDT_MAGIC) throw new Error('bad fdt magic');
  const total = buf.readUInt32BE(4);
  const offStruct = buf.readUInt32BE(8);
  const offStrings = buf.readUInt32BE(12);
  const offRsv = buf.readUInt32BE(16);
  const version = buf.readUInt32BE(20);
  const lastComp = buf.readUInt32BE(24);
  const bootCpu = buf.readUInt32BE(28);
  const sizeStrings = buf.readUInt32BE(32);
  const sizeStruct = buf.readUInt32BE(36);

  const rsv = [];
  for (let p = offRsv; ; p += 16) {
    const addr = buf.readBigUInt64BE(p);
    const size = buf.readBigUInt64BE(p + 8);
    if (addr === 0n && size === 0n) break;
    rsv.push([addr, size]);
  }

  const cstr = (o, end) => {
    let e = o;
    while (e < end && buf[e] !== 0) e++;
    return buf.toString('utf8', o, e);
  };

  const root = { name: '', props: [], children: [] };
  const stack = [root];
  let first = true;
  let p = offStruct;
  for (;;) {
    const tok = buf.readUInt32BE(p);
    p += 4;
    if (tok === 1) {
      const name = cstr(p, offStruct + sizeStruct);
      p = (p + name.length + 1 + 3) & ~3;
      if (first) {
        root.name = name;
        first = false;
      } else {
        const node = { name, props: [], children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      }
    } else if (tok === 2) {
      stack.pop();
    } else if (tok === 3) {
      const len = buf.readUInt32BE(p);
      const nameoff = buf.readUInt32BE(p + 4);
      p += 8;
      const name = cstr(offStrings + nameoff, offStrings + sizeStrings);
      const value = Buffer.from(buf.subarray(p, p + len));
      p = (p + len + 3) & ~3;
      stack[stack.length - 1].props.push({ name, value });
    } else if (tok === 4) {
      // nop
    } else if (tok === 9) {
      break;
    } else {
      throw new Error('bad fdt token ' + tok + ' at ' + (p - 4));
    }
  }
  return { root, rsv, version, lastComp, bootCpu, total };
}

export function findNode(root, path) {
  let node = root;
  for (const seg of path.split('/').filter(Boolean)) {
    node = node.children.find((c) => c.name === seg);
    if (!node) return null;
  }
  return node;
}

export function getProp(node, name) {
  return node ? node.props.find((p) => p.name === name) : null;
}

export function cellProp(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v >>> 0, 0);
  return b;
}

export function serializeFdt(tree) {
  const strings = [];
  const strOff = new Map();
  const strBytes = [];
  let strLen = 0;
  function intern(name) {
    if (strOff.has(name)) return strOff.get(name);
    const off = strLen;
    strOff.set(name, off);
    const b = Buffer.from(name + '\0', 'utf8');
    strBytes.push(b);
    strLen += b.length;
    return off;
  }

  const struct = [];
  const push32 = (v) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(v >>> 0, 0);
    struct.push(b);
  };
  const pad4 = () => {
    const len = struct.reduce((n, b) => n + b.length, 0);
    const rem = len & 3;
    if (rem) struct.push(Buffer.alloc(4 - rem));
  };

  function emit(node) {
    push32(1);
    struct.push(Buffer.from(node.name + '\0', 'utf8'));
    pad4();
    for (const pr of node.props) {
      push32(3);
      push32(pr.value.length);
      push32(intern(pr.name));
      struct.push(pr.value);
      pad4();
    }
    for (const c of node.children) emit(c);
    push32(2);
  }
  emit(tree.root);
  push32(9);

  const structBuf = Buffer.concat(struct);
  const stringsBuf = Buffer.concat(strBytes);

  const hdrSize = 40;
  const rsvBuf = Buffer.alloc(16 * (tree.rsv.length + 1));
  tree.rsv.forEach(([a, s], i) => {
    rsvBuf.writeBigUInt64BE(a, i * 16);
    rsvBuf.writeBigUInt64BE(s, i * 16 + 8);
  });

  const offRsv = hdrSize;
  const offStruct = offRsv + rsvBuf.length;
  const offStrings = offStruct + structBuf.length;
  const total = offStrings + stringsBuf.length;

  const out = Buffer.alloc(total);
  out.writeUInt32BE(FDT_MAGIC, 0);
  out.writeUInt32BE(total, 4);
  out.writeUInt32BE(offStruct, 8);
  out.writeUInt32BE(offStrings, 12);
  out.writeUInt32BE(offRsv, 16);
  out.writeUInt32BE(tree.version || 17, 20);
  out.writeUInt32BE(tree.lastComp || 16, 24);
  out.writeUInt32BE(tree.bootCpu || 0, 28);
  out.writeUInt32BE(stringsBuf.length, 32);
  out.writeUInt32BE(structBuf.length, 36);
  rsvBuf.copy(out, offRsv);
  structBuf.copy(out, offStruct);
  stringsBuf.copy(out, offStrings);
  return out;
}