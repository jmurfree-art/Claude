// Pure-TS SRT/VTT subtitle text extractor. No external deps, safe on client
// and server (though it is only ever invoked server-side by lib/ytdlp.ts).

const INDEX_LINE_RE = /^\d+$/;
const TIMESTAMP_LINE_RE = /-->/;
const TAG_RE = /<[^>]*>/g;
const ASS_CUE_RE = /\{\\an?\d+\}/gi;
const VTT_HEADER_RE = /^WEBVTT.*$/i;
const VTT_META_RE = /^(Kind|Language|NOTE|STYLE|Region):/i;

/**
 * Parse an SRT (or WebVTT-ish) subtitle payload down to plain, deduplicated
 * text suitable for feeding into the summarizer.
 */
export function parseSrt(srt: string): string {
  if (!srt) return '';

  const rawLines = srt.replace(/\r\n/g, '\n').split('\n');
  const cleanedLines: string[] = [];

  for (const rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (VTT_HEADER_RE.test(line)) continue;
    if (VTT_META_RE.test(line)) continue;
    if (INDEX_LINE_RE.test(line)) continue;
    if (TIMESTAMP_LINE_RE.test(line)) continue;

    // Strip inline tags like <b>, <i>, <c.colorXXXXXX>, <00:00:01.000> etc.
    line = line.replace(TAG_RE, '');
    // Strip ASS-style positioning cues e.g. {\an8}
    line = line.replace(ASS_CUE_RE, '');
    // Collapse internal whitespace
    line = line.replace(/\s+/g, ' ').trim();

    if (!line) continue;

    cleanedLines.push(line);
  }

  // Dedupe exact consecutive duplicate lines (rolling auto-caption repeats).
  const deduped: string[] = [];
  for (const line of cleanedLines) {
    if (deduped.length > 0 && deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }

  return deduped.join(' ').replace(/\s+/g, ' ').trim();
}
