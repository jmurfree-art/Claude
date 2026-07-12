#!/usr/bin/env node
// WatchDeck live smoke test — Windows-friendly (pure Node, no bash, no dev
// server needed). Exercises the previously-"blocked" checks against a REAL
// Supabase project by talking to it exactly the way the app's server routes
// do: auth (GoTrue), row-level security on videos + watchlist, Storage
// upload + signed URL, and cross-user isolation.
//
// Prereqs (in order):
//   1. scripts/setup-supabase.ps1 has written .env.local (URL + anon + service_role)
//   2. pnpm install  (so @supabase/supabase-js is available)
//   3. node scripts/live-smoke.mjs
//
// Reads .env.local itself — no dotenv dependency. Cleans up everything it
// creates (users, rows, storage objects). Never fabricates a pass.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const results = [];
const rec = (name, ok, detail) => {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name} — ${detail}`);
};

function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) {
    console.error('ERROR: .env.local not found. Run scripts/setup-supabase.ps1 first.');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    console.error('ERROR: .env.local missing URL / anon / service_role. Re-run the setup script.');
    process.exit(1);
  }
  console.log(`Target: ${url}\n`);

  let createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch {
    console.error('ERROR: @supabase/supabase-js not found. Run `pnpm install` first.');
    process.exit(1);
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const stamp = Date.now();
  const emailA = `wd-smoke-a-${stamp}@example.com`;
  const emailB = `wd-smoke-b-${stamp}@example.com`;
  const pass = 'Smoke-Passw0rd!' + stamp;

  let userA, userB, videoId;
  const objects = [];

  try {
    // L1 — connectivity + schema present
    {
      const { error } = await admin.from('videos').select('id').limit(1);
      rec('L1 connect + schema', !error, error ? error.message : 'videos table reachable via service role');
      if (error) throw new Error('schema not applied — run the setup script / migration first');
    }

    // L2 — auth: create + sign in two users
    {
      const a = await admin.auth.admin.createUser({ email: emailA, password: pass, email_confirm: true });
      const b = await admin.auth.admin.createUser({ email: emailB, password: pass, email_confirm: true });
      userA = a.data?.user; userB = b.data?.user;
      const ok = !!userA && !!userB && !a.error && !b.error;
      rec('L2 auth signup', ok, ok ? 'two users created (email auto-confirmed)' : (a.error?.message || b.error?.message || 'createUser failed'));
      if (!ok) throw new Error('auth setup failed');
    }

    const clientA = createClient(url, anon, { auth: { persistSession: false } });
    const clientB = createClient(url, anon, { auth: { persistSession: false } });
    {
      const sa = await clientA.auth.signInWithPassword({ email: emailA, password: pass });
      const sb = await clientB.auth.signInWithPassword({ email: emailB, password: pass });
      const ok = !sa.error && !sb.error && !!sa.data?.session && !!sb.data?.session;
      rec('L2 auth signin', ok, ok ? 'both users signed in with anon key' : (sa.error?.message || sb.error?.message || 'sign-in failed'));
      if (!ok) throw new Error('sign-in failed');
    }

    // L3 — owner insert + public cross-user read
    {
      const ins = await clientA.from('videos')
        .insert({ kind: 'link', title: 'Smoke video', external_url: 'https://example.com/smoke', owner_id: userA.id, status: 'ready' })
        .select('id').single();
      videoId = ins.data?.id;
      rec('L3 owner insert (RLS write)', !!videoId && !ins.error, ins.error ? ins.error.message : `inserted ${videoId}`);
      if (!videoId) throw new Error('insert failed');

      const read = await clientB.from('videos').select('id,title').eq('id', videoId).maybeSingle();
      rec('L3 public cross-user read', read.data?.id === videoId, read.error ? read.error.message : `user B can read the row`);
    }

    // L4 — cross-user update + soft-delete are blocked by RLS
    {
      const upd = await clientB.from('videos').update({ title: 'HACKED' }).eq('id', videoId).select();
      const after = await admin.from('videos').select('title').eq('id', videoId).single();
      const ok = (upd.data?.length ?? 0) === 0 && after.data?.title === 'Smoke video';
      rec('L4 cross-user update blocked', ok, `rows changed by B: ${upd.data?.length ?? 0}; title still "${after.data?.title}"`);

      const del = await clientB.from('videos').update({ deleted_at: new Date().toISOString() }).eq('id', videoId).select();
      const after2 = await admin.from('videos').select('deleted_at').eq('id', videoId).single();
      rec('L4 cross-user soft-delete blocked', (del.data?.length ?? 0) === 0 && after2.data?.deleted_at === null,
        `rows changed by B: ${del.data?.length ?? 0}; deleted_at=${after2.data?.deleted_at}`);
    }

    // L5 — watchlist isolation
    {
      const ins = await clientA.from('watchlist').insert({
        user_id: userA.id, video_id: videoId,
        snapshot: { videoId: 'x', title: 't', thumbnail: '', channel: '', durationSec: null, url: 'https://example.com' },
      }).select();
      rec('L5 own watchlist insert', (ins.data?.length ?? 0) === 1, ins.error ? ins.error.message : 'A saved own row');

      const seen = await clientB.from('watchlist').select('*').eq('user_id', userA.id);
      rec('L5 watchlist read isolation', (seen.data?.length ?? 0) === 0, `B sees ${seen.data?.length ?? 0} of A's rows`);

      await clientB.from('watchlist').delete().eq('user_id', userA.id);
      const survive = await admin.from('watchlist').select('user_id').eq('user_id', userA.id);
      rec('L5 watchlist delete isolation', (survive.data?.length ?? 0) === 1, `${survive.data?.length ?? 0} row(s) survive B's delete attempt`);
    }

    // L6 — Storage: owner upload + signed URL, cross-user upload denied
    {
      const bytes = Buffer.alloc(2048, 7);
      const objPath = `${userA.id}/smoke-${stamp}.bin`;
      const up = await clientA.storage.from('user-videos').upload(objPath, bytes, { contentType: 'application/octet-stream' });
      const upOk = !up.error;
      if (upOk) objects.push(objPath);
      rec('L6 owner storage upload (RLS)', upOk, up.error ? up.error.message : `uploaded ${objPath}`);

      if (upOk) {
        const signed = await admin.storage.from('user-videos').createSignedUrl(objPath, 60);
        let fetched = 0;
        if (signed.data?.signedUrl) {
          const r = await fetch(signed.data.signedUrl);
          fetched = r.ok ? (await r.arrayBuffer()).byteLength : 0;
        }
        rec('L6 signed URL fetch', fetched === bytes.length, `downloaded ${fetched} bytes via signed URL`);
      }

      const hackPath = `${userA.id}/hack-${stamp}.bin`;
      const badUp = await clientB.storage.from('user-videos').upload(hackPath, bytes);
      if (!badUp.error) objects.push(hackPath); // clean up if it wrongly succeeded
      rec('L6 cross-user upload blocked', !!badUp.error, badUp.error ? 'B cannot write into A\'s folder' : 'SECURITY: B wrote into A\'s folder!');
    }

    // L7 — owner soft-delete hides the row from public reads
    {
      await clientA.from('videos').update({ deleted_at: new Date().toISOString() }).eq('id', videoId);
      const read = await clientB.from('videos').select('id').eq('id', videoId).maybeSingle();
      rec('L7 owner soft-delete hides row', !read.data, `B now sees ${read.data ? 1 : 0} row(s)`);
    }
  } catch (err) {
    console.log(`\n(aborted early: ${err?.message || err})`);
  } finally {
    // cleanup
    try { for (const o of objects) await admin.storage.from('user-videos').remove([o]); } catch {}
    try { if (videoId) await admin.from('videos').delete().eq('id', videoId); } catch {}
    try { if (userA) await admin.auth.admin.deleteUser(userA.id); } catch {}
    try { if (userB) await admin.auth.admin.deleteUser(userB.id); } catch {}
  }

  const fails = results.filter((r) => r.status === 'FAIL');
  console.log(`\nLive smoke: ${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('live-smoke crashed:', e?.stack || e); process.exit(1); });
