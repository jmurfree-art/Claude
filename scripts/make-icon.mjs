#!/usr/bin/env node
/**
 * Regenerates public/icons/icon.ico (used by the Windows desktop shortcut).
 *
 * Renders play-button PNGs at several sizes with ffmpeg, then packs them
 * into a single .ico (ICO containers accept embedded PNGs since Vista).
 * Run from the repo root: `node scripts/make-icon.mjs`. Requires ffmpeg.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const SIZES = [256, 48, 32, 16];
const OUT = path.join(process.cwd(), "public", "icons", "icon.ico");

const work = mkdtempSync(path.join(tmpdir(), "avatarstudio-icon-"));
try {
  const pngs = SIZES.map((size) => {
    const file = path.join(work, `icon-${size}.png`);
    const fontsize = Math.round(size * 0.55);
    execFileSync(FFMPEG, [
      "-v", "error",
      "-f", "lavfi",
      "-i", `color=c=0x6D4FD4:size=${size}x${size}`,
      "-vf",
      `drawtext=fontfile=${FONT}:text='▶':fontsize=${fontsize}:fontcolor=white:` +
        // Optical centering: nudge the glyph slightly right of geometric center.
        `x=(w-text_w)/2+w*0.04:y=(h-text_h)/2-th*0.08`,
      "-frames:v", "1",
      "-y", file,
    ]);
    return readFileSync(file);
  });

  // ICONDIR header + one ICONDIRENTRY per image, followed by raw PNG blobs.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  pngs.forEach((png, i) => {
    const size = SIZES[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  });

  writeFileSync(OUT, Buffer.concat([header, ...entries, ...pngs]));
  console.log(`Wrote ${OUT}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
