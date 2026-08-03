import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchTranscript, isValidYouTubeId } from '@/lib/ytdlp';
import { summarize } from '@/lib/summarize';
import type { SummarizeResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  videoId: z.string().refine((v) => isValidYouTubeId(v), { message: 'Invalid YouTube video id' }),
  length: z.enum(['short', 'long']).default('short'),
});

const MAX_SUMMARY_LENGTH = 480;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function zodMessage(error: z.ZodError): string {
  const flat = error.flatten();
  const fieldMsgs = Object.entries(flat.fieldErrors).flatMap(([field, msgs]) =>
    (msgs ?? []).map((m) => `${field}: ${m}`),
  );
  return [...flat.formErrors, ...fieldMsgs].join('; ') || 'Invalid request';
}

function truncateSummary(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  const slice = text.slice(0, MAX_SUMMARY_LENGTH);
  let boundary = -1;
  for (const ch of ['.', '!', '?']) {
    const idx = slice.lastIndexOf(ch);
    if (idx > boundary) boundary = idx;
  }
  if (boundary >= 0) {
    return slice.slice(0, boundary + 1);
  }
  return `${text.slice(0, 477)}…`;
}

async function handle(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      videoId: searchParams.get('videoId') ?? undefined,
      length: searchParams.get('length') ?? undefined,
    });

    if (!parsed.success) {
      return jsonError(zodMessage(parsed.error), 400);
    }

    const { videoId, length } = parsed.data;
    const sentences = length === 'long' ? 7 : 4;

    let transcript;
    try {
      transcript = await fetchTranscript(videoId);
    } catch (err) {
      if (err instanceof Error && err.message === 'NO_TRANSCRIPT') {
        return jsonError('No transcript or description available', 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(`yt-dlp failed: ${message.slice(0, 200)}`, 502);
    }

    const summaryRaw = summarize(transcript.text, { sentences });
    const summary = truncateSummary(summaryRaw);

    const body: SummarizeResponse = {
      summary,
      source: transcript.source,
    };

    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
