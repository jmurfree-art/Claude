import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const idSchema = z.string().uuid();

const SIGNED_URL_TTL_SECONDS = 3600;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isConfigError(err: unknown): boolean {
  return err instanceof Error && /not configured/i.test(err.message);
}

type Params = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const idParsed = idSchema.safeParse(params.id);
    if (!idParsed.success) {
      return jsonError('Invalid video id', 400);
    }
    const id = idParsed.data;

    let admin;
    try {
      admin = createAdminSupabase();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }

    const { data: video, error } = await admin
      .from('videos')
      .select('id, storage_path')
      .eq('id', id)
      .eq('kind', 'upload')
      .is('deleted_at', null)
      .not('storage_path', 'is', null)
      .single();

    if (error || !video || !video.storage_path) {
      return jsonError('Video not found', 404);
    }

    const { data: signed, error: signError } = await admin.storage
      .from('user-videos')
      .createSignedUrl(video.storage_path as string, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      return jsonError('Video not found', 404);
    }

    return NextResponse.json(
      {
        url: signed.signedUrl,
        expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}
