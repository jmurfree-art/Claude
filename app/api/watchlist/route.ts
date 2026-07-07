import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidYouTubeId } from '@/lib/ytdlp';
import { createAdminSupabase, createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import type { WatchlistItem, WatchlistSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const youTubeResultSchema = z.object({
  id: z.string().refine((v) => isValidYouTubeId(v), { message: 'Invalid YouTube video id' }),
  title: z.string().min(1),
  url: z.string().url(),
  thumbnail: z.string(),
  channel: z.string(),
  durationSec: z.number().nullable(),
  viewCount: z.number().nullable(),
});

const postSchema = z.object({
  video: youTubeResultSchema,
});

const deleteSchema = z.object({
  videoId: z.string().min(1),
});

async function requireUser() {
  const user = await getSessionUser();
  return user;
}

export async function GET() {
  try {
    let user;
    try {
      user = await requireUser();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }
    if (!user) return jsonError('Unauthorized', 401);

    let supabase;
    try {
      supabase = createServerSupabase();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }

    const { data, error } = await supabase
      .from('watchlist')
      .select('video_id, snapshot, added_at')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false });

    if (error) {
      return jsonError(error.message, 500);
    }

    return NextResponse.json({ items: (data ?? []) as WatchlistItem[] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let user;
    try {
      user = await requireUser();
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

    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
      return jsonError(zodMessage(parsed.error), 400);
    }
    const { video } = parsed.data;

    let admin;
    let supabase;
    try {
      admin = createAdminSupabase();
      supabase = createServerSupabase();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }

    let videoUuid: string | null = null;

    const { data: existing, error: selectErr } = await admin
      .from('videos')
      .select('id')
      .eq('kind', 'youtube')
      .eq('external_id', video.id)
      .limit(1)
      .maybeSingle();

    if (selectErr) {
      return jsonError(selectErr.message, 500);
    }

    if (existing) {
      videoUuid = existing.id as string;
    } else {
      const { data: inserted, error: insertErr } = await admin
        .from('videos')
        .insert({
          kind: 'youtube',
          external_id: video.id,
          title: video.title,
          thumbnail_url: video.thumbnail || null,
          duration_sec: video.durationSec,
          channel: video.channel || null,
          status: 'ready',
        })
        .select('id')
        .single();

      if (insertErr) {
        if (insertErr.code === '23505') {
          const { data: retryExisting, error: retryErr } = await admin
            .from('videos')
            .select('id')
            .eq('kind', 'youtube')
            .eq('external_id', video.id)
            .limit(1)
            .maybeSingle();
          if (retryErr || !retryExisting) {
            return jsonError(retryErr?.message ?? 'Failed to resolve video', 500);
          }
          videoUuid = retryExisting.id as string;
        } else {
          return jsonError(insertErr.message, 500);
        }
      } else {
        videoUuid = (inserted as { id: string }).id;
      }
    }

    if (!videoUuid) {
      return jsonError('Failed to resolve video', 500);
    }

    const snapshot: WatchlistSnapshot = {
      videoId: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      channel: video.channel,
      durationSec: video.durationSec,
      url: video.url,
    };

    const { error: upsertErr } = await supabase.from('watchlist').upsert(
      {
        user_id: user.id,
        video_id: videoUuid,
        snapshot,
      },
      { onConflict: 'user_id,video_id', ignoreDuplicates: true },
    );

    if (upsertErr) {
      return jsonError(upsertErr.message, 500);
    }

    const item: WatchlistItem = {
      video_id: videoUuid,
      snapshot,
      added_at: new Date().toISOString(),
    };

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    let user;
    try {
      user = await requireUser();
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

    const parsed = deleteSchema.safeParse(json);
    if (!parsed.success) {
      return jsonError(zodMessage(parsed.error), 400);
    }
    const { videoId } = parsed.data;

    let admin;
    let supabase;
    try {
      admin = createAdminSupabase();
      supabase = createServerSupabase();
    } catch (err) {
      if (isConfigError(err)) return jsonError('Supabase not configured', 503);
      throw err;
    }

    let videoUuid: string | null = null;

    if (UUID_RE.test(videoId)) {
      videoUuid = videoId;
    } else if (isValidYouTubeId(videoId)) {
      const { data: resolved, error: resolveErr } = await admin
        .from('videos')
        .select('id')
        .eq('kind', 'youtube')
        .eq('external_id', videoId)
        .limit(1)
        .maybeSingle();
      if (resolveErr) {
        return jsonError(resolveErr.message, 500);
      }
      videoUuid = resolved ? (resolved.id as string) : null;
    } else {
      return jsonError('Invalid videoId', 400);
    }

    if (videoUuid) {
      const { error: deleteErr } = await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('video_id', videoUuid);

      if (deleteErr) {
        return jsonError(deleteErr.message, 500);
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}
