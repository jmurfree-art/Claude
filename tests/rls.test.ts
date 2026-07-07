// Cross-user Row Level Security checks against a real Supabase project.
// Skips entirely (describe.skipIf) when Supabase env vars aren't configured
// — this is expected in sandboxes with no hosted Supabase project.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !anon || !service)('watchlist & videos RLS', () => {
  const password = 'Rls-Test-Passw0rd!1';

  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let videoId: string;

  beforeAll(async () => {
    const { createClient } = await import('@supabase/supabase-js');

    admin = createClient(url as string, service as string, {
      auth: { persistSession: false },
    });

    const emailA = `rls-a-${Date.now()}@example.test`;
    const emailB = `rls-b-${Date.now()}@example.test`;

    const { data: createdA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA || !createdA.user) {
      throw new Error(`failed to create user A: ${errA?.message ?? 'unknown error'}`);
    }
    userA = { id: createdA.user.id, email: emailA };

    const { data: createdB, error: errB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (errB || !createdB.user) {
      throw new Error(`failed to create user B: ${errB?.message ?? 'unknown error'}`);
    }
    userB = { id: createdB.user.id, email: emailB };

    clientA = createClient(url as string, anon as string, { auth: { persistSession: false } });
    clientB = createClient(url as string, anon as string, { auth: { persistSession: false } });

    const { error: signInAErr } = await clientA.auth.signInWithPassword({
      email: emailA,
      password,
    });
    if (signInAErr) throw new Error(`sign-in A failed: ${signInAErr.message}`);

    const { error: signInBErr } = await clientB.auth.signInWithPassword({
      email: emailB,
      password,
    });
    if (signInBErr) throw new Error(`sign-in B failed: ${signInBErr.message}`);
  });

  afterAll(async () => {
    if (!admin) return;
    if (videoId) {
      await admin.from('watchlist').delete().eq('video_id', videoId);
      await admin.from('videos').delete().eq('id', videoId);
    }
    if (userA) await admin.auth.admin.deleteUser(userA.id);
    if (userB) await admin.auth.admin.deleteUser(userB.id);
  });

  it('(1) user A can insert a videos row', async () => {
    const { data, error } = await clientA
      .from('videos')
      .insert({ kind: 'link', title: 'RLS Test Video', owner_id: userA.id })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    videoId = data!.id as string;
  });

  it('(2) user B cannot update user A row (0 rows affected)', async () => {
    const { data, error } = await clientB
      .from('videos')
      .update({ title: 'hacked by B' })
      .eq('id', videoId)
      .select();

    // Either the update affects 0 rows, or RLS surfaces as an error.
    expect((data ?? []).length === 0 || error !== null).toBe(true);

    const { data: reRead } = await admin
      .from('videos')
      .select('title')
      .eq('id', videoId)
      .single();
    expect(reRead?.title).toBe('RLS Test Video');
  });

  it('(3) user A can insert a watchlist row; user B cannot select it', async () => {
    const { error: insertErr } = await clientA.from('watchlist').insert({
      user_id: userA.id,
      video_id: videoId,
      snapshot: {
        videoId,
        title: 'RLS Test Video',
        thumbnail: '',
        channel: '',
        durationSec: null,
        url: '',
      },
    });
    expect(insertErr).toBeNull();

    const { data: bView } = await clientB.from('watchlist').select('*').eq('video_id', videoId);
    expect((bView ?? []).length).toBe(0);
  });

  it('(4) user B cannot delete user A watchlist row', async () => {
    await clientB.from('watchlist').delete().eq('video_id', videoId).eq('user_id', userA.id);

    const { data: stillThere } = await admin
      .from('watchlist')
      .select('*')
      .eq('video_id', videoId)
      .eq('user_id', userA.id);
    expect((stillThere ?? []).length).toBe(1);
  });

  it('(5) user B CAN select user A non-deleted video (public read)', async () => {
    const { data, error } = await clientB.from('videos').select('*').eq('id', videoId).single();
    expect(error).toBeNull();
    expect(data?.id).toBe(videoId);
  });

  it('(6) after owner soft-deletes, user B no longer sees the video', async () => {
    const { error: softDeleteErr } = await clientA
      .from('videos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', videoId);
    expect(softDeleteErr).toBeNull();

    const { data } = await clientB.from('videos').select('*').eq('id', videoId).maybeSingle();
    expect(data).toBeNull();
  });
});
