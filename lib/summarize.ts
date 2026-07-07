// Pure-TS, deterministic, frequency-based extractive summarizer. No deps.

/** ~120 common English stopwords excluded from term-frequency scoring. */
export const DEFAULT_STOPWORDS: Set<string> = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an',
  'and', 'any', 'are', 'aren', 'as', 'at', 'be', 'because', 'been',
  'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'could', 'did', 'do', 'does', 'doing', 'don', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he',
  'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'll',
  'm', 'ma', 'me', 'might', 'more', 'most', 'must', 'my', 'myself',
  'need', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 're',
  's', 'same', 'shall', 'she', 'should', 'shouldn', 'so', 'some', 'such',
  't', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'wasn', 'we', 'were',
  'weren', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'will', 'with', 'won', 'would', 'wouldn', 'you', 'your',
  'yours', 'yourself', 'yourselves', 've', 'd', 'gonna', 'gotta',
  'like', 'okay', 'ok', 'yeah', 'um', 'uh', 'also',
]);

const SENTENCE_SPLIT_RE = /([.!?…]+)(?=\s|$)|\n+/g;

/**
 * Split text into sentences. Splits on . ! ? … followed by whitespace/EOL
 * (keeping the terminator attached), and also treats newlines as sentence
 * boundaries. Sentences shorter than 3 characters (after trim) are dropped.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];

  const normalized = text.replace(/\r\n/g, '\n');
  const sentences: string[] = [];
  let buf = '';

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '\n') {
      if (buf.trim()) sentences.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
    if (/[.!?…]/.test(ch)) {
      // Consume any additional terminator chars (e.g. "?!", "...")
      let j = i + 1;
      while (j < normalized.length && /[.!?…]/.test(normalized[j])) {
        buf += normalized[j];
        j++;
      }
      const next = normalized[j];
      if (next === undefined || /\s/.test(next)) {
        if (buf.trim()) sentences.push(buf.trim());
        buf = '';
        i = j - 1;
      } else {
        i = j - 1;
      }
    }
  }
  if (buf.trim()) sentences.push(buf.trim());

  return sentences.filter((s) => s.trim().length >= 3);
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9']+/g);
  return matches ?? [];
}

function clampSentenceCount(n: number): number {
  return Math.max(1, Math.min(8, Math.floor(n)));
}

function defaultSentenceCount(textLength: number): number {
  if (textLength < 800) return 3;
  if (textLength < 3000) return 4;
  return 5;
}

/**
 * Deterministic frequency-based extractive summarizer.
 * - Tokenizes to lowercase words, excludes stopwords & words < 3 chars.
 * - Word score = term frequency normalized by the max term frequency.
 * - Sentence score = sum(word scores) / sqrt(wordCount || 1).
 * - Picks the top-N highest scoring sentences, then re-sorts them into
 *   their original order and joins with a single space.
 */
export function summarize(text: string, opts?: { sentences?: number }): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';

  const sentences = splitSentences(trimmed);

  const targetN = opts?.sentences != null
    ? clampSentenceCount(opts.sentences)
    : defaultSentenceCount(trimmed.length);

  if (sentences.length === 0) {
    return trimmed.slice(0, 400).trim();
  }

  if (sentences.length <= targetN) {
    return trimmed.trim();
  }

  // Build term frequencies across the whole text.
  const freq = new Map<string, number>();
  for (const word of tokenize(trimmed)) {
    if (word.length < 3) continue;
    if (DEFAULT_STOPWORDS.has(word)) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  let maxFreq = 0;
  for (const count of freq.values()) {
    if (count > maxFreq) maxFreq = count;
  }

  const wordScores = new Map<string, number>();
  if (maxFreq > 0) {
    for (const [word, count] of freq) {
      wordScores.set(word, count / maxFreq);
    }
  }

  const scored = sentences.map((sentence, index) => {
    const words = tokenize(sentence).filter(
      (w) => w.length >= 3 && !DEFAULT_STOPWORDS.has(w),
    );
    const score = words.reduce((sum, w) => sum + (wordScores.get(w) ?? 0), 0);
    const denom = Math.sqrt(words.length || 1);
    return { sentence, index, score: score / denom };
  });

  const top = [...scored]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, targetN)
    .sort((a, b) => a.index - b.index);

  const result = top.map((s) => s.sentence).join(' ').trim();

  return result || trimmed.slice(0, 400).trim();
}
