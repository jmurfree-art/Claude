// Importing @/lib/ytdlp must not spawn anything at import time — the
// module only defines functions; nothing here sets YTDLP_MOCK or any other
// env var, and no child process should be created just by loading it.
import { describe, it, expect } from 'vitest';
import { parseJsonLines, normalizeEntry, isValidYouTubeId } from '@/lib/ytdlp';

describe('parseJsonLines', () => {
  it('tolerates garbage and blank lines, returning only valid JSON objects, and never throws', () => {
    const input = [
      '{"a":1}',
      'not json at all',
      '',
      '   ',
      '{"b":2}',
      '{broken json',
      '{"c":3}',
    ].join('\n');

    expect(() => parseJsonLines(input)).not.toThrow();
    const result = parseJsonLines(input);
    expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('returns an empty array for empty input without throwing', () => {
    expect(() => parseJsonLines('')).not.toThrow();
    expect(parseJsonLines('')).toEqual([]);
  });
});

describe('normalizeEntry', () => {
  it('maps a flat-playlist-style entry to a YouTubeResult with a constructed watch URL and fallback thumbnail', () => {
    const entry = {
      id: 'dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      channel: 'Rick Astley',
      duration: 212,
      view_count: 1_000_000_000,
    };

    const result = normalizeEntry(entry);

    expect(result).toEqual({
      id: 'dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      channel: 'Rick Astley',
      durationSec: 212,
      viewCount: 1_000_000_000,
    });
  });

  it('maps a full-dump entry, picking a thumbnail from thumbnails[] and falling back to uploader for channel', () => {
    const entry = {
      id: 'dQw4w9WgXcQ',
      title: 'Full Dump Title',
      uploader: 'Uploader Name',
      duration: 100,
      view_count: 500,
      thumbnails: [
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', width: 120 },
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', width: 320 },
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480 },
      ],
    };

    const result = normalizeEntry(entry);

    expect(result).not.toBeNull();
    expect(result?.channel).toBe('Uploader Name');
    expect(result?.thumbnail).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(result?.durationSec).toBe(100);
    expect(result?.viewCount).toBe(500);
  });

  it('returns null for entries with a missing or malformed id', () => {
    expect(normalizeEntry({ id: 'short', title: 'x' })).toBeNull(); // too short
    expect(normalizeEntry({ id: 'abcdefghijkl', title: 'x' })).toBeNull(); // 12 chars, too long
    expect(normalizeEntry({ id: 'abcdefgh!@#', title: 'x' })).toBeNull(); // 11 chars but invalid characters
    expect(normalizeEntry({ title: 'no id at all' })).toBeNull();
    expect(normalizeEntry(null)).toBeNull();
    expect(normalizeEntry('not an object')).toBeNull();
  });
});

describe('isValidYouTubeId', () => {
  it('accepts a well-formed 11-character id', () => {
    expect(isValidYouTubeId('dQw4w9WgXcQ')).toBe(true);
  });

  it('rejects ids that are too short', () => {
    expect(isValidYouTubeId('abc')).toBe(false);
  });

  it('rejects ids with disallowed characters', () => {
    expect(isValidYouTubeId('dQw4w9WgXc$')).toBe(false);
  });

  it('rejects ids that are too long', () => {
    expect(isValidYouTubeId('abcdefghijkl')).toBe(false); // 12 chars
  });
});
