import { describe, it, expect } from 'vitest';
import { summarize } from '@/lib/summarize';
import { parseSrt } from '@/lib/srt';

function sentenceCount(text: string): number {
  const matches = text.match(/[.!?]/g);
  return matches ? matches.length : 0;
}

// ~15-sentence sample with varied vocabulary so the frequency-based scorer
// has clear signal about which sentences matter most.
const LONG_SAMPLE = [
  'WatchDeck is a small app for searching YouTube videos and saving them to a personal watchlist.',
  'The home page lets you search YouTube directly without needing an account.',
  'Every search result shows a thumbnail, a title, a channel name, and a duration badge.',
  'You can save any YouTube result to your watchlist by tapping the heart icon.',
  'Saved videos are tracked in a watchlist table alongside a frozen snapshot of the card data.',
  'Signed-in users can also upload their own video files for private hosting.',
  'Uploaded files are stored in a private Supabase Storage bucket scoped to each user.',
  'A signed URL is generated on demand so uploaded videos can be streamed securely.',
  'Users can also create simple link-based entries that point at an external URL.',
  'The library page lists every video a user owns, with edit and delete actions.',
  'Deleting a video is a soft delete: the row is flagged rather than removed immediately.',
  'A public video page renders the title, description, and an embedded player.',
  'The summarize feature uses cached captions or a video description to build a short summary.',
  'Summaries are generated with a deterministic frequency-based extractive algorithm.',
  'Overall, WatchDeck aims to be a lightweight companion for discovering and organizing video content.',
].join(' ');

describe('summarize', () => {
  it('returns a non-empty summary shorter than the input, with at most 5 sentences by default', () => {
    const result = summarize(LONG_SAMPLE);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(LONG_SAMPLE.length);
    expect(sentenceCount(result)).toBeLessThanOrEqual(5);
  });

  it('respects opts.sentences and is deterministic across calls', () => {
    const first = summarize(LONG_SAMPLE, { sentences: 2 });
    const second = summarize(LONG_SAMPLE, { sentences: 2 });
    expect(sentenceCount(first)).toBeLessThanOrEqual(2);
    expect(first.length).toBeGreaterThan(0);
    expect(first).toBe(second);
  });

  it('returns short input trimmed and unchanged', () => {
    const shortInput = '  This is one sentence. This is a second sentence.  ';
    const result = summarize(shortInput);
    expect(result).toBe(shortInput.trim());
  });
});

describe('parseSrt', () => {
  it('strips indices, timestamps, and tags, and dedupes consecutive duplicate cues', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:04,000',
      'Welcome to this <i>tutorial</i>.',
      '',
      '2',
      '00:00:04,000 --> 00:00:07,000',
      'Today we build a web app.',
      '',
      '3',
      '00:00:07,000 --> 00:00:10,000',
      'Today we build a web app.',
      '',
      '4',
      '00:00:10,000 --> 00:00:13,000',
      "Let's get started right away.",
      '',
    ].join('\n');

    const result = parseSrt(srt);

    // No '-->' timestamp markers should survive.
    expect(result).not.toContain('-->');

    // Inline tags like <i> should be stripped.
    expect(result).not.toMatch(/<[^>]*>/);

    // No bare index-line tokens (e.g. standalone "1", "2", "3", "4") should
    // remain as separate whitespace-delimited tokens in the output.
    const digitOnlyTokens = result.split(' ').filter((tok) => /^\d+$/.test(tok));
    expect(digitOnlyTokens).toEqual([]);

    // The tag-stripped cue text should be present, tag-free.
    expect(result).toContain('Welcome to this tutorial.');

    // The consecutive duplicate cue should be collapsed to a single occurrence.
    const occurrences = (result.match(/Today we build a web app\./g) ?? []).length;
    expect(occurrences).toBe(1);

    // Single-spaced: no double spaces anywhere.
    expect(result).not.toMatch(/ {2,}/);
  });
});
