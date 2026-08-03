import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidYouTubeId, videoExists } from '@/lib/ytdlp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IDS = 24;
const CONCURRENCY = 4;

const querySchema = z.object({
  ids: z.string().min(1, 'ids is required'),
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

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners: Promise<void>[] = [];
  const runNext = async (): Promise<void> => {
    const current = index++;
    if (current >= items.length) return;
    await worker(items[current]!);
    await runNext();
  };
  const poolSize = Math.min(limit, items.length);
  for (let i = 0; i < poolSize; i++) {
    runners.push(runNext());
  }
  await Promise.all(runners);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      ids: searchParams.get('ids') ?? undefined,
    });

    if (!parsed.success) {
      return jsonError(zodMessage(parsed.error), 400);
    }

    const ids = parsed.data.ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, MAX_IDS);

    const available: Record<string, boolean> = {};
    const toCheck = ids.filter((id) => {
      if (!isValidYouTubeId(id)) {
        available[id] = false;
        return false;
      }
      return true;
    });

    await runWithConcurrency(toCheck, CONCURRENCY, async (id) => {
      available[id] = await videoExists(id);
    });

    return NextResponse.json({ available }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}
