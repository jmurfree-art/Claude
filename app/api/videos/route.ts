import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminSupabase, createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import type { VideoRow } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isConfigError(err: unknown): boolean {
  return err instanceof Error && /not configured/i.test(err.message);
}

function zodMessage(error: z.ZodError): string {
  const flat = error.flatten();
  const fieldMsgs = Object.entries(flat.fieldErrors).flatMap(([field, msgs]) =>
    (msgs ?? []).map((m) => `${field}: ${m}`),
  );
  return [...flat.formErrors, ...fieldMsgs].join('; ') || 'Invalid request';
}

const httpUrlSchema = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), { message: 'Must be an http(s) URL' });

const createVideoSchema = z.object({
  kind: z.enum(['link', 'upload']),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional().default([]),
  external_url: httpUrlSchema.optional(),
  thumbnail_url: httpUrlSchema.optional(),
  storage_path: z.string().optional(),
  duration_sec: z.number().int().nonnegative().optional(),
});

type CreateVideoInput = z.infer<typeof createVideoSchema>;

async function probeAndFinalizeUpload(
  videoId: string,
  storagePath: string,
): Promise<void> {
  let durationSec: number | null = null;
  try {
    const admin = createAdminSupabase();
    const { data: signed, error: signError } = await admin.storage
      .from('user-videos')
      .createSignedUrl(storagePath, 60);
    if (signError || !signed?.signedUrl) {
      throw signError ?? new Error('no signed url');
    }
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      signed.signedUrl,
    ]);
    const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
    const raw = parsed.format?.duration ? Number(parsed.format.duration) : NaN;
    if (Number.isFinite(raw) && raw >= 0) {
      durationSec = Math.round(raw);
    }
  } catch {
    // best-effort probe only; ignore any failure
  }

  try {
    const admin = createAdminSupabase();
    const update: Record<string, unknown> = { status: 'ready' };
    if (durationSec != null) update.duration_sec = durationSec;
    await admin.from('videos').update(update).eq('id', videoId);
  } catch {
    // if we can't finalize, leave the row as-is
  }
}

export async function POST(request: NextRequest) {
  try {
    let user;
    try {
      user = await getSessionUser();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }
    if (!user) return jsonError('Unauthorized', 401);

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    const parsed = createVideoSchema.safeParse(json);
    if (!parsed.success) {
      return jsonError(zodMessage(parsed.error), 400);
    }
    const input: CreateVideoInput = parsed.data;

    if (input.kind === 'upload') {
      if (!input.storage_path || !input.storage_path.startsWith(`${user.id}/`)) {
        return jsonError('storage_path must belong to the authenticated user', 403);
      }
    }

    let supabase;
    try {
      supabase = createServerSupabase();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }

    const status: VideoRow['status'] = input.kind === 'upload' ? 'processing' : 'ready';

    const insertRow = {
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      tags: input.tags,
      external_url: input.external_url ?? null,
      thumbnail_url: input.thumbnail_url ?? null,
      storage_path: input.storage_path ?? null,
      duration_sec: input.duration_sec ?? null,
      owner_id: user.id,
      status,
    };

    const { data: video, error } = await supabase
      .from('videos')
      .insert(insertRow)
      .select()
      .single();

    if (error || !video) {
      return jsonError(error?.message ?? 'Failed to create video', 500);
    }

    if (input.kind === 'upload' && input.storage_path) {
      await probeAndFinalizeUpload((video as VideoRow).id, input.storage_path);
      const { data: refreshed } = await supabase
        .from('videos')
        .select()
        .eq('id', (video as VideoRow).id)
        .single();
      if (refreshed) {
        return NextResponse.json({ video: refreshed as VideoRow }, { status: 201 });
      }
    }

    return NextResponse.json({ video: video as VideoRow }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    let user;
    try {
      user = await getSessionUser();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }
    if (!user) return jsonError('Unauthorized', 401);

    const { searchParams } = new URL(request.url);
    if (searchParams.get('mine') !== '1') {
      return jsonError('mine=1 is required', 400);
    }

    let supabase;
    try {
      supabase = createServerSupabase();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }

    const { data, error } = await supabase
      .from('videos')
      .select()
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return jsonError(error.message, 500);
    }

    return NextResponse.json({ videos: (data ?? []) as VideoRow[] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}
