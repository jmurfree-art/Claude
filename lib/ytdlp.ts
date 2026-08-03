// SERVER-ONLY MODULE.
// This module shells out to the yt-dlp binary via node:child_process and
// touches the filesystem (node:fs/promises). The `server-only` package is
// not among this project's available dependencies, so this comment is the
// enforcement mechanism instead: NEVER import lib/ytdlp from a 'use client'
// file, a client component, or any code that ends up in the browser bundle.

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { YouTubeResult } from '@/lib/types';
import { parseSrt } from '@/lib/srt';

const execFile = promisify(execFileCb);

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const RETRY_DELAY_MS = 500;
const NETWORK_ERROR_RE =
  /network|timed?\s?out|connection|proxy|EAI_AGAIN|ECONN|unable to download/i;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

interface ExecFileError extends Error {
  stderr?: string;
  killed?: boolean;
  signal?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Resolve the yt-dlp binary + base args, honoring YTDLP_MOCK for sandboxed/CI runs. */
export function ytDlpBin(): { bin: string; baseArgs: string[] } {
  if (process.env.YTDLP_MOCK === '1') {
    return {
      bin: process.execPath,
      baseArgs: [path.join(process.cwd(), 'scripts/mock-yt-dlp.mjs')],
    };
  }
  return { bin: process.env.YTDLP_BIN || 'yt-dlp', baseArgs: [] };
}

function isNetworkish(err: ExecFileError): boolean {
  const stderr = typeof err.stderr === 'string' ? err.stderr : '';
  const message = err.message || '';
  if (NETWORK_ERROR_RE.test(stderr) || NETWORK_ERROR_RE.test(message)) return true;
  // A timeout-triggered kill is treated as a transient, network-ish failure.
  if (err.killed && (err.signal === 'SIGKILL' || err.signal === 'SIGTERM')) return true;
  return false;
}

function wrapError(err: unknown): Error {
  const e = err as ExecFileError;
  const stderr = typeof e?.stderr === 'string' ? e.stderr.trim() : '';
  return new Error(stderr || e?.message || 'yt-dlp failed');
}

/**
 * Run yt-dlp (or the mock binary) with the given args. Never invokes a
 * shell. 30s default timeout (SIGKILL on expiry), 32MB max buffer, and
 * exactly one retry (after a 500ms delay) when the failure looks
 * network-related. Appends --cookies <YTDLP_COOKIES_PATH> when configured.
 * Rejects with an Error whose message carries stderr.
 */
export async function runYtDlp(
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<string> {
  const { bin, baseArgs } = ytDlpBin();
  const finalArgs = [...baseArgs, ...args];
  if (process.env.YTDLP_COOKIES_PATH) {
    finalArgs.push('--cookies', process.env.YTDLP_COOKIES_PATH);
  }

  const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const run = async (): Promise<string> => {
    const { stdout } = await execFile(bin, finalArgs, {
      timeout,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true,
    });
    return stdout;
  };

  try {
    return await run();
  } catch (firstErr) {
    if (!isNetworkish(firstErr as ExecFileError)) {
      throw wrapError(firstErr);
    }
    await sleep(RETRY_DELAY_MS);
    try {
      return await run();
    } catch (secondErr) {
      throw wrapError(secondErr);
    }
  }
}

/** Tolerant JSON-lines parser: skips non-JSON lines, never throws. */
export function parseJsonLines(stdout: string): unknown[] {
  if (!stdout) return [];
  const results: unknown[] = [];
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      results.push(JSON.parse(line));
    } catch {
      // tolerant: skip lines that aren't valid JSON
    }
  }
  return results;
}

function bestThumbnail(entry: Record<string, unknown>, id: string): string {
  const direct = asString(entry.thumbnail);
  if (direct) return direct;

  const thumbnails = entry.thumbnails;
  if (Array.isArray(thumbnails) && thumbnails.length > 0) {
    let best: { url: string; width: number } | null = null;
    for (const item of thumbnails) {
      if (!isRecord(item)) continue;
      const url = asString(item.url);
      if (!url) continue;
      const width = asFiniteNumber(item.width) ?? 0;
      if (!best || width >= best.width) {
        best = { url, width };
      }
    }
    if (best) return best.url;
  }

  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Maps a yt-dlp flat-playlist/full-dump JSON entry to a YouTubeResult, or null if invalid. */
export function normalizeEntry(e: unknown): YouTubeResult | null {
  if (!isRecord(e)) return null;

  const id = asString(e.id);
  if (!id || !YOUTUBE_ID_RE.test(id)) return null;

  const title = asString(e.title) ?? '';
  const channel = asString(e.channel) ?? asString(e.uploader) ?? '';
  const durationSec = asFiniteNumber(e.duration) ?? null;
  const viewCount = asFiniteNumber(e.view_count) ?? null;

  return {
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: bestThumbnail(e, id),
    channel,
    durationSec,
    viewCount,
  };
}

function sanitizeQuery(query: string): string {
  // Strip control characters (incl. null bytes), trim, cap length.
  let out = '';
  for (const ch of query) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) continue;
    out += ch;
  }
  return out.trim().slice(0, 200);
}

/** Regex-validated 11-char YouTube video id check. */
export function isValidYouTubeId(id: string): boolean {
  return YOUTUBE_ID_RE.test(id);
}

/** Search YouTube via yt-dlp's ytsearch pseudo-URL, returning one page of results. */
export async function searchYouTube(
  query: string,
  page: number,
  perPage = 12,
): Promise<YouTubeResult[]> {
  const sanitized = sanitizeQuery(query);
  if (!sanitized) {
    throw new Error('Search query must not be empty');
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 12;
  const count = safePage * safePerPage;

  const stdout = await runYtDlp([
    `ytsearch${count}:${sanitized}`,
    '--dump-json',
    '--skip-download',
    '--flat-playlist',
  ]);

  const entries = parseJsonLines(stdout)
    .map(normalizeEntry)
    .filter((v): v is YouTubeResult => v !== null);

  const start = (safePage - 1) * safePerPage;
  return entries.slice(start, start + safePerPage);
}

/** Fetch metadata for a single video id; returns null on any failure. */
export async function fetchVideoMeta(id: string): Promise<YouTubeResult | null> {
  if (!isValidYouTubeId(id)) return null;
  try {
    const stdout = await runYtDlp([
      `https://www.youtube.com/watch?v=${id}`,
      '--dump-json',
      '--skip-download',
    ]);
    const [entry] = parseJsonLines(stdout);
    return normalizeEntry(entry);
  } catch {
    return null;
  }
}

/** Fetch full yt-dlp JSON for a video, returning normalized meta + raw description. */
export async function fetchVideoInfoRaw(
  id: string,
): Promise<{ meta: YouTubeResult; description: string } | null> {
  if (!isValidYouTubeId(id)) return null;
  try {
    const stdout = await runYtDlp([
      `https://www.youtube.com/watch?v=${id}`,
      '--dump-json',
      '--skip-download',
    ]);
    const [raw] = parseJsonLines(stdout);
    if (!isRecord(raw)) return null;
    const meta = normalizeEntry(raw);
    if (!meta) return null;
    const description = asString(raw.description) ?? '';
    return { meta, description };
  } catch {
    return null;
  }
}

/** Whether a YouTube video id currently resolves to fetchable metadata. */
export async function videoExists(id: string): Promise<boolean> {
  const meta = await fetchVideoMeta(id);
  return meta !== null;
}

/**
 * Fetch a transcript for a video: try auto/manual captions converted to
 * SRT first, falling back to the video description, then throwing
 * Error('NO_TRANSCRIPT') if neither is available. Subtitle download
 * failures never crash this function — any .srt file that did get written
 * is still picked up. Temp files are best-effort cleaned up in `finally`.
 */
export async function fetchTranscript(
  id: string,
): Promise<{ text: string; source: 'captions' | 'description' }> {
  if (!isValidYouTubeId(id)) {
    throw new Error('Invalid YouTube video id');
  }

  const tmpDir = process.env.TRANSCRIPT_TMP_DIR || '/tmp/watchdeck-transcripts';
  await fs.mkdir(tmpDir, { recursive: true });

  const outputTemplate = path.join(tmpDir, id);
  const writtenFiles: string[] = [];

  try {
    try {
      await runYtDlp([
        `https://www.youtube.com/watch?v=${id}`,
        '--write-auto-subs',
        '--write-subs',
        '--skip-download',
        '--sub-langs',
        'en.*,en',
        '--convert-subs',
        'srt',
        '-o',
        outputTemplate,
      ]);
    } catch {
      // A nonzero exit here must not crash the whole flow — an .srt file
      // may still have been written to disk before yt-dlp failed. Fall
      // through and check for it below regardless of this error.
    }

    let dirEntries: string[] = [];
    try {
      dirEntries = await fs.readdir(tmpDir);
    } catch {
      dirEntries = [];
    }

    const srtNames = dirEntries.filter(
      (name) => name.startsWith(id) && name.endsWith('.srt'),
    );
    for (const name of srtNames) writtenFiles.push(path.join(tmpDir, name));

    let combinedText = '';
    for (const filePath of writtenFiles) {
      try {
        const contents = await fs.readFile(filePath, 'utf8');
        const parsed = parseSrt(contents);
        if (parsed) {
          combinedText = combinedText ? `${combinedText} ${parsed}` : parsed;
        }
      } catch {
        // ignore unreadable subtitle file
      }
    }
    combinedText = combinedText.trim();

    if (combinedText) {
      return { text: combinedText, source: 'captions' };
    }

    const info = await fetchVideoInfoRaw(id);
    const description = info?.description.trim();
    if (description) {
      return { text: description, source: 'description' };
    }

    throw new Error('NO_TRANSCRIPT');
  } finally {
    for (const filePath of writtenFiles) {
      try {
        await fs.unlink(filePath);
      } catch {
        // best-effort cleanup
      }
    }
  }
}
