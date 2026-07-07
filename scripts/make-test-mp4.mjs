#!/usr/bin/env node
// Writes selfcheck-artifacts/test.mp4: a minimal-but-structurally-valid MP4
// (ftyp + free + mdat boxes, correct big-endian box-length headers) padded
// to exactly 1 MiB, for use as an upload fixture by scripts/selfcheck.mjs.
// No dependencies.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TOTAL_SIZE = 1024 * 1024; // exactly 1 MiB

function box(type, payload) {
  if (type.length !== 4) throw new Error(`box type must be 4 chars: ${type}`);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0); // big-endian box size (header + payload)
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function buildMp4(totalSize) {
  // ftyp: major brand isom, minor version 512, a few compatible brands.
  const ftypPayload = Buffer.concat([
    Buffer.from('isom', 'ascii'), // major_brand
    Buffer.from([0x00, 0x00, 0x02, 0x00]), // minor_version = 512
    Buffer.from('isom', 'ascii'),
    Buffer.from('iso2', 'ascii'),
    Buffer.from('avc1', 'ascii'),
    Buffer.from('mp41', 'ascii'),
  ]);
  const ftypBox = box('ftyp', ftypPayload);

  // free: empty payload, just a header — valid zero-length box.
  const freeBox = box('free', Buffer.alloc(0));

  const mdatHeaderSize = 8;
  const usedSoFar = ftypBox.length + freeBox.length + mdatHeaderSize;
  if (usedSoFar > totalSize) {
    throw new Error('totalSize too small to fit ftyp + free + mdat header');
  }
  const mdatPayload = Buffer.alloc(totalSize - usedSoFar, 0); // zero-filled padding
  const mdatBox = box('mdat', mdatPayload);

  const result = Buffer.concat([ftypBox, freeBox, mdatBox]);
  if (result.length !== totalSize) {
    throw new Error(`internal size mismatch: built ${result.length}, expected ${totalSize}`);
  }
  return result;
}

async function main() {
  const outDir = path.join(process.cwd(), 'selfcheck-artifacts');
  const outPath = path.join(outDir, 'test.mp4');
  await mkdir(outDir, { recursive: true });
  const buf = buildMp4(TOTAL_SIZE);
  await writeFile(outPath, buf);
  process.stdout.write(`wrote ${outPath} (${buf.length} bytes)\n`);
}

main().catch((err) => {
  process.stderr.write(`make-test-mp4: ${err?.stack || err?.message || String(err)}\n`);
  process.exit(1);
});
