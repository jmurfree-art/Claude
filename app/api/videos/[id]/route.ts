import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import type { VideoRow } from '@/lib/types';

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

const idSchema = z.string().uuid();

const httpUrlSchema = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), { message: 'Must be an http(s) URL' });

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullable(),
    tags: z.array(z.string().max(40)).max(20),
    thumbnail_url: httpUrlSchema.nullable(),
    external_url: httpUrlSchema.nullable(),
  })
  .partial();

type Params = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const idParsed = idSchema.safeParse(params.id);
    if (!idParsed.success) {
      return jsonError('Invalid video id', 400);
    }
    const id = idParsed.data;

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

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return jsonError(zodMessage(parsed.error), 400);
    }

    const fields = parsed.data;
    if (Object.keys(fields).length === 0) {
      return jsonError('At least one field is required', 400);
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
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) {
      return jsonError('Video not found', 404);
    }

    return NextResponse.json({ video: data as VideoRow }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const idParsed = idSchema.safeParse(params.id);
    if (!idParsed.success) {
      return jsonError('Invalid video id', 400);
    }
    const id = idParsed.data;

    let user;
    try {
      user = await getSessionUser();
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
      .from('videos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .select('id')
      .single();

    if (error || !data) {
      return jsonError('Video not found', 404);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}
