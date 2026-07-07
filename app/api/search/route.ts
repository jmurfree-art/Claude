import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchYouTube } from '@/lib/ytdlp';
import type { SearchResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PER_PAGE = 12;

const querySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'q is required')
    .max(200, 'q must be at most 200 characters'),
  page: z.coerce.number().int().min(1).default(1),
});

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      page: searchParams.get('page') ?? undefined,
    });

    if (!parsed.success) {
      return jsonError(zodMessage(parsed.error), 400);
    }

    const { q, page } = parsed.data;

    let results;
    try {
      results = await searchYouTube(q, page, PER_PAGE);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(`yt-dlp search failed: ${message.slice(0, 200)}`, 502);
    }

    const body: SearchResponse = {
      results,
      page,
      hasMore: results.length === PER_PAGE,
    };

    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}
