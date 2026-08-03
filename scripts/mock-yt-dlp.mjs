#!/usr/bin/env node
// Mock yt-dlp CLI used for sandboxed/CI runs (YTDLP_MOCK=1). Faithfully
// mimics the subset of the real yt-dlp argv surface that lib/ytdlp.ts
// invokes: search (ytsearchN:QUERY), single-video full dump (--dump-json on
// a watch URL), and subtitle download (--write-auto-subs/--write-subs -o
// BASE on a watch URL). No dependencies beyond node:crypto/node:fs/node:path.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ID_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** Deterministic 11-char id (charset A-Za-z0-9_-) derived from a seed string. */
function deterministicId(seed) {
  const digest = createHash('sha256').update(seed).digest();
  let id = '';
  for (let i = 0; i < 11; i++) {
    id += ID_CHARS[digest[i] % ID_CHARS.length];
  }
  return id;
}

function fail(message) {
  process.stderr.write(`mock-yt-dlp: ${message}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);

function hasFlag(flag) {
  return args.includes(flag);
}

function flagValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract an 11-char YouTube video id from a watch/short URL, or null. */
function extractWatchId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '');
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
    const v = u.searchParams.get('v');
    if (v && YOUTUBE_ID_RE.test(v)) return v;
    return null;
  } catch {
    return null;
  }
}

const searchArg = args.find((a) => /^ytsearch\d+:.+/.test(a));
const watchArgRaw = args.find(
  (a) => /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(a),
);

function thumbUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function thumbnailsArray(id) {
  return [
    { url: `https://i.ytimg.com/vi/${id}/default.jpg`, width: 120, height: 90 },
    { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, width: 320, height: 180 },
    { url: thumbUrl(id), width: 480, height: 360 },
  ];
}

async function runSearch(match) {
  const parsed = /^ytsearch(\d+):(.+)$/.exec(match);
  if (!parsed) fail(`could not parse search target: ${match}`);
  const count = Number(parsed[1]);
  const query = parsed[2];
  if (!Number.isFinite(count) || count <= 0) fail(`invalid search count in: ${match}`);

  const lines = [];
  for (let i = 1; i <= count; i++) {
    const id = deterministicId(`${query}:${i}`);
    const entry = {
      id,
      title: `${query} — result ${i}`,
      webpage_url: `https://www.youtube.com/watch?v=${id}`,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: thumbUrl(id),
      thumbnails: thumbnailsArray(id),
      channel: `Mock Channel ${(i % 3) + 1}`,
      uploader: `Mock Channel ${(i % 3) + 1}`,
      duration: 120 + i * 17,
      view_count: 1000 * i + 123,
    };
    lines.push(JSON.stringify(entry));
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function mockDescription(id) {
  return [
    `This is a mock yt-dlp description for video ${id}, generated for sandbox and CI test runs.`,
    'It stands in for a real YouTube description so the summarizer has extractive-sentence material to work with.',
    'The mock content talks about building modern web applications with a search page, a watchlist, and a personal video library.',
    `Nothing in this description is fetched from the network — video id ${id} is embedded purely for traceability.`,
    'Downstream code should treat this text exactly like a real yt-dlp description field.',
  ].join(' ');
}

async function runFullDump(url) {
  const id = extractWatchId(url);
  if (!id) fail(`could not extract a video id from: ${url}`);
  // Vary duration/view_count deterministically per id without depending on
  // a search index, since a full dump is requested for one specific video.
  const seedNum = Array.from(id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const i = (seedNum % 50) + 1;
  const entry = {
    id,
    title: `Mock Video ${id}`,
    webpage_url: `https://www.youtube.com/watch?v=${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: thumbUrl(id),
    thumbnails: thumbnailsArray(id),
    channel: `Mock Channel ${(i % 3) + 1}`,
    uploader: `Mock Channel ${(i % 3) + 1}`,
    duration: 120 + i * 17,
    view_count: 1000 * i + 123,
    description: mockDescription(id),
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

/** ~14 SRT cues about building web apps, with one consecutive duplicate pair. */
function buildMockSrt() {
  const sentences = [
    'Welcome back to this tutorial on building modern web apps.',
    "Today we're going to set up a new project from scratch.",
    'First, make sure you have Node twenty or later installed.',
    "Next, we'll scaffold the app with the framework's CLI tool.",
    'Once that finishes, open the project in your editor of choice.',
    "Let's take a quick look at the folder structure it generated.",
    "Let's take a quick look at the folder structure it generated.",
    'The pages directory is where our routes will live.',
    'We can add a new API route by creating a file in the api folder.',
    'Styling is handled with a small utility-first CSS framework.',
    'Now we will connect the app to a hosted database for persistence.',
    'Authentication can be layered on top using a managed auth provider.',
    'Before shipping, always double check your environment variables.',
    "That's it for this walkthrough — thanks for following along.",
  ];

  const lines = [];
  let startSec = 0;
  sentences.forEach((text, idx) => {
    const endSec = startSec + 3;
    lines.push(String(idx + 1));
    lines.push(`${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}`);
    lines.push(text);
    lines.push('');
    startSec = endSec;
  });
  return lines.join('\n');
}

function formatSrtTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},000`;
}

async function runSubtitles(url) {
  const id = extractWatchId(url);
  if (!id) fail(`could not extract a video id from: ${url}`);
  const base = flagValue('-o');
  if (!base) fail('missing -o <base> for subtitle download');

  const outPath = `${base}.en.srt`;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, buildMockSrt(), 'utf8');
  // yt-dlp prints progress to stdout normally, but the caller only reads
  // files off disk for this invocation — stay silent and exit 0.
}

async function main() {
  if (searchArg && hasFlag('--dump-json')) {
    await runSearch(searchArg);
    return;
  }

  if (watchArgRaw && (hasFlag('--write-auto-subs') || hasFlag('--write-subs'))) {
    await runSubtitles(watchArgRaw);
    return;
  }

  if (watchArgRaw && hasFlag('--dump-json')) {
    await runFullDump(watchArgRaw);
    return;
  }

  fail(`no recognized target/flag combination in args: ${JSON.stringify(args)}`);
}

main().catch((err) => {
  fail(err?.stack || err?.message || String(err));
});
