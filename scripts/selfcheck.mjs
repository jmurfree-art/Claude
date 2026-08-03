#!/usr/bin/env node
// WatchDeck self-check harness. Drives a running instance of the app (see
// scripts/selfcheck.sh) through the checklist described in the contract.
// Every check reports PASS, FAIL, or BLOCKED(reason) — nothing is ever
// fabricated as a PASS. Supabase-dependent checks BLOCK cleanly when
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY aren't set; the live-YouTube link check BLOCKs
// unless SELFCHECK_MODE=live. No dependencies beyond Node 20 built-ins.

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3111';
const TEST_MP4_PATH = path.join(process.cwd(), 'selfcheck-artifacts', 'test.mp4');
const TEST_PASSWORD = 'Selfcheck-Passw0rd!1';

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return null;
  return { url, anon, service };
}

async function loadSupabaseJs() {
  try {
    return await import('@supabase/supabase-js');
  } catch (err) {
    return { __error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// S1: search
// ---------------------------------------------------------------------------
async function checkSearch() {
  const name = 'S1 search';
  try {
    const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent('never gonna give you up')}`);
    if (res.status !== 200) {
      return { name, status: 'FAIL', detail: `expected 200, got ${res.status}`, data: { results: [] } };
    }
    const body = await res.json();
    const results = Array.isArray(body.results) ? body.results : [];
    if (results.length < 5) {
      return { name, status: 'FAIL', detail: `expected >=5 results, got ${results.length}`, data: { results } };
    }
    const bad = results.find((r) => !r?.title || !r?.thumbnail || r?.durationSec == null);
    if (bad) {
      return {
        name,
        status: 'FAIL',
        detail: `a result is missing title/thumbnail/durationSec: ${JSON.stringify(bad)}`,
        data: { results },
      };
    }
    return {
      name,
      status: 'PASS',
      detail: `${results.length} results returned, all with title/thumbnail/durationSec`,
      data: { results },
    };
  } catch (err) {
    return { name, status: 'FAIL', detail: `request failed: ${err?.message ?? String(err)}`, data: { results: [] } };
  }
}

// ---------------------------------------------------------------------------
// S2: link liveness (live mode only)
// ---------------------------------------------------------------------------
async function checkLinksLive(s1) {
  const name = 'S2 links live';
  if (process.env.SELFCHECK_MODE !== 'live') {
    return {
      name,
      status: 'BLOCKED',
      detail: 'YouTube egress blocked in sandbox; run SELFCHECK_MODE=live where YouTube is reachable',
    };
  }
  const results = s1?.data?.results ?? [];
  if (results.length === 0) {
    return { name, status: 'FAIL', detail: 'no search results available from S1 to verify link liveness' };
  }
  const sample = results.slice(0, 6);
  const failures = [];
  for (const r of sample) {
    try {
      let res = await fetch(r.url, { method: 'HEAD', redirect: 'follow' });
      if (res.status === 405 || res.status >= 400) {
        res = await fetch(r.url, { method: 'GET', redirect: 'follow' });
      }
      if (res.status !== 200) failures.push(`${r.url} -> ${res.status}`);
    } catch (err) {
      failures.push(`${r.url} -> ${err?.message ?? String(err)}`);
    }
  }
  if (failures.length > 0) {
    return { name, status: 'FAIL', detail: `unreachable/non-200 links: ${failures.join('; ')}` };
  }
  return { name, status: 'PASS', detail: `${sample.length} links resolved to a final status of 200` };
}

// ---------------------------------------------------------------------------
// S3: summarize
// ---------------------------------------------------------------------------
async function checkSummarize(s1) {
  const name = 'S3 summarize';
  const first = s1?.data?.results?.[0]?.id;
  const videoId = first || 'dQw4w9WgXcQ';
  try {
    const res = await fetch(`${BASE}/api/summarize?videoId=${encodeURIComponent(videoId)}`, {
      method: 'POST',
    });
    if (res.status !== 200) {
      const text = await res.text().catch(() => '');
      return { name, status: 'FAIL', detail: `expected 200, got ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = await res.json();
    if (typeof body.summary !== 'string' || body.summary.length === 0) {
      return { name, status: 'FAIL', detail: 'summary missing or empty' };
    }
    if (body.summary.length >= 500) {
      return { name, status: 'FAIL', detail: `summary length ${body.summary.length} is not < 500` };
    }
    return {
      name,
      status: 'PASS',
      detail: `videoId=${videoId}, summary length=${body.summary.length}, source=${body.source}`,
    };
  } catch (err) {
    return { name, status: 'FAIL', detail: `request failed: ${err?.message ?? String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// S4: auth + watchlist roundtrip (DB layer + route gate)
// ---------------------------------------------------------------------------
async function checkAuthWatchlist() {
  const name = 'S4 auth+watchlist roundtrip (DB layer + route gate)';
  const cfg = supabaseConfig();
  if (!cfg) {
    return { name, status: 'BLOCKED', detail: 'Supabase not configured in this environment' };
  }

  const mod = await loadSupabaseJs();
  if (mod.__error) {
    return { name, status: 'BLOCKED', detail: `@supabase/supabase-js not resolvable: ${mod.__error}` };
  }
  const { createClient } = mod;

  const admin = createClient(cfg.url, cfg.service, { auth: { persistSession: false } });
  const email = `selfcheck-watchlist+${Date.now()}@example.test`;
  let userId;
  let videoId;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return { name, status: 'BLOCKED', detail: `could not create test user: ${createErr?.message ?? 'unknown error'}` };
    }
    userId = created.user.id;

    const userClient = createClient(cfg.url, cfg.anon, { auth: { persistSession: false } });
    const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    if (signInErr) {
      return { name, status: 'FAIL', detail: `sign-in failed right after createUser: ${signInErr.message}` };
    }

    // Mirror what POST /api/watchlist does: admin resolves-or-inserts a
    // kind='youtube' videos row, then a user-scoped client inserts the
    // watchlist row (exercising watchlist_owner_crud RLS).
    const externalId = 'dQw4w9WgXcQ';
    const { data: existing } = await admin
      .from('videos')
      .select('id')
      .eq('kind', 'youtube')
      .eq('external_id', externalId)
      .maybeSingle();

    if (existing) {
      videoId = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await admin
        .from('videos')
        .insert({ kind: 'youtube', external_id: externalId, title: 'Selfcheck Video', status: 'ready' })
        .select('id')
        .single();
      if (insertErr || !inserted) {
        return { name, status: 'FAIL', detail: `admin video resolve-or-insert failed: ${insertErr?.message}` };
      }
      videoId = inserted.id;
    }

    const { error: wlErr } = await userClient.from('watchlist').upsert(
      {
        user_id: userId,
        video_id: videoId,
        snapshot: {
          videoId: externalId,
          title: 'Selfcheck Video',
          thumbnail: '',
          channel: '',
          durationSec: null,
          url: `https://www.youtube.com/watch?v=${externalId}`,
        },
      },
      { onConflict: 'user_id,video_id' },
    );
    if (wlErr) {
      return { name, status: 'FAIL', detail: `user-scoped watchlist insert failed (RLS?): ${wlErr.message}` };
    }

    const { data: rows, error: selErr } = await userClient
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .eq('video_id', videoId);
    if (selErr || !rows || rows.length !== 1) {
      return {
        name,
        status: 'FAIL',
        detail: `watchlist roundtrip select mismatch: ${selErr?.message ?? JSON.stringify(rows)}`,
      };
    }

    // Route gate: an anonymous request to a middleware-protected page must
    // redirect to /login (verifies middleware.ts, not the DB layer).
    const gateRes = await fetch(`${BASE}/watchlist`, { redirect: 'manual' });
    const location = gateRes.headers.get('location') || '';
    const gateOk = gateRes.status >= 300 && gateRes.status < 400 && location.includes('/login');
    if (!gateOk) {
      return {
        name,
        status: 'FAIL',
        detail: `expected /watchlist to redirect anonymous requests to /login, got status ${gateRes.status} location="${location}"`,
      };
    }

    return {
      name,
      status: 'PASS',
      detail:
        'DB-layer roundtrip (admin video resolve-or-insert + user-scoped watchlist insert/select honoring RLS) succeeded; ' +
        '/watchlist redirects anonymous requests to /login (auth gate). The cookie-session UI flow (login form -> ' +
        'session cookie -> authenticated watchlist page) is verified manually, not by this script.',
    };
  } catch (err) {
    return { name, status: 'FAIL', detail: `unexpected error: ${err?.message ?? String(err)}` };
  } finally {
    try {
      if (videoId && userId) await admin.from('watchlist').delete().eq('user_id', userId).eq('video_id', videoId);
    } catch {
      // best-effort cleanup
    }
    try {
      if (userId) await admin.auth.admin.deleteUser(userId);
    } catch {
      // best-effort cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// S5: upload
// ---------------------------------------------------------------------------
async function checkUpload() {
  const name = 'S5 upload';
  const cfg = supabaseConfig();
  if (!cfg) {
    return { name, status: 'BLOCKED', detail: 'Supabase not configured in this environment' };
  }

  let fileBuf;
  try {
    fileBuf = await fs.readFile(TEST_MP4_PATH);
  } catch {
    return {
      name,
      status: 'BLOCKED',
      detail: `test fixture not found at ${TEST_MP4_PATH}; run scripts/make-test-mp4.mjs first`,
    };
  }
  if (fileBuf.length < 1024 * 1024) {
    return { name, status: 'FAIL', detail: `test.mp4 is ${fileBuf.length} bytes, expected >= 1MiB` };
  }

  const mod = await loadSupabaseJs();
  if (mod.__error) {
    return { name, status: 'BLOCKED', detail: `@supabase/supabase-js not resolvable: ${mod.__error}` };
  }
  const { createClient } = mod;

  const admin = createClient(cfg.url, cfg.service, { auth: { persistSession: false } });
  const email = `selfcheck-upload+${Date.now()}@example.test`;
  let userId;
  let videoId;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return { name, status: 'BLOCKED', detail: `could not create test user: ${createErr?.message ?? 'unknown error'}` };
    }
    userId = created.user.id;

    const userClient = createClient(cfg.url, cfg.anon, { auth: { persistSession: false } });
    const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    if (signInErr) {
      return { name, status: 'FAIL', detail: `sign-in failed right after createUser: ${signInErr.message}` };
    }

    // Service-role upload: bypasses storage RLS, just a raw capability check.
    const adminPath = `${userId}/selfcheck-admin-${Date.now()}.mp4`;
    const { error: adminUploadErr } = await admin.storage
      .from('user-videos')
      .upload(adminPath, fileBuf, { contentType: 'video/mp4' });
    if (adminUploadErr) {
      return { name, status: 'FAIL', detail: `admin storage upload failed: ${adminUploadErr.message}` };
    }

    // User-scoped upload into their own folder: exercises the
    // storage.objects RLS policies from the migration.
    const storagePath = `${userId}/selfcheck-${Date.now()}.mp4`;
    const { error: userUploadErr } = await userClient.storage
      .from('user-videos')
      .upload(storagePath, fileBuf, { contentType: 'video/mp4' });
    if (userUploadErr) {
      return {
        name,
        status: 'FAIL',
        detail: `user-scoped storage upload failed (check storage.objects RLS policies): ${userUploadErr.message}`,
      };
    }

    const { data: video, error: insertErr } = await userClient
      .from('videos')
      .insert({ kind: 'upload', title: 'Selfcheck Upload', storage_path: storagePath, owner_id: userId, status: 'ready' })
      .select('id')
      .single();
    if (insertErr || !video) {
      return { name, status: 'FAIL', detail: `videos insert failed: ${insertErr?.message}` };
    }
    videoId = video.id;

    const signedRes = await fetch(`${BASE}/api/videos/${videoId}/signed-url`);
    if (signedRes.status !== 200) {
      const text = await signedRes.text().catch(() => '');
      return { name, status: 'FAIL', detail: `signed-url route returned ${signedRes.status}: ${text.slice(0, 200)}` };
    }
    const { url: signedUrl } = await signedRes.json();
    const fileRes = await fetch(signedUrl);
    if (fileRes.status !== 200) {
      return { name, status: 'FAIL', detail: `fetching the signed URL returned ${fileRes.status}` };
    }
    const downloaded = Buffer.from(await fileRes.arrayBuffer());
    if (downloaded.length < 1024 * 1024) {
      return { name, status: 'FAIL', detail: `downloaded file is ${downloaded.length} bytes, expected >= 1MiB` };
    }

    return {
      name,
      status: 'PASS',
      detail: `admin + user-scoped uploads succeeded; signed-url route served ${downloaded.length} bytes`,
    };
  } catch (err) {
    return { name, status: 'FAIL', detail: `unexpected error: ${err?.message ?? String(err)}` };
  } finally {
    try {
      if (videoId) await admin.from('videos').delete().eq('id', videoId);
    } catch {
      // best-effort cleanup
    }
    try {
      if (userId) {
        const { data: list } = await admin.storage.from('user-videos').list(userId);
        const names = (list ?? []).filter((f) => f.name.startsWith('selfcheck')).map((f) => `${userId}/${f.name}`);
        if (names.length > 0) await admin.storage.from('user-videos').remove(names);
      }
    } catch {
      // best-effort cleanup
    }
    try {
      if (userId) await admin.auth.admin.deleteUser(userId);
    } catch {
      // best-effort cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// S6: create link -> public page
// ---------------------------------------------------------------------------
async function checkCreateLinkPublic() {
  const name = 'S6 create link -> public';
  const cfg = supabaseConfig();
  if (!cfg) {
    return { name, status: 'BLOCKED', detail: 'Supabase not configured in this environment' };
  }

  const mod = await loadSupabaseJs();
  if (mod.__error) {
    return { name, status: 'BLOCKED', detail: `@supabase/supabase-js not resolvable: ${mod.__error}` };
  }
  const { createClient } = mod;

  const admin = createClient(cfg.url, cfg.service, { auth: { persistSession: false } });
  const email = `selfcheck-link+${Date.now()}@example.test`;
  const title = `Selfcheck Link Video ${Date.now()}`;
  let userId;
  let videoId;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return { name, status: 'BLOCKED', detail: `could not create test user: ${createErr?.message ?? 'unknown error'}` };
    }
    userId = created.user.id;

    const userClient = createClient(cfg.url, cfg.anon, { auth: { persistSession: false } });
    const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    if (signInErr) {
      return { name, status: 'FAIL', detail: `sign-in failed right after createUser: ${signInErr.message}` };
    }

    // Inserted via the DB layer (user-scoped client honoring RLS), not the
    // app's POST /api/videos route, since that route needs a cookie-carrying
    // browser session that this Node harness doesn't have.
    const { data: video, error: insertErr } = await userClient
      .from('videos')
      .insert({ kind: 'link', title, external_url: 'https://example.com/selfcheck', owner_id: userId, status: 'ready' })
      .select('id')
      .single();
    if (insertErr || !video) {
      return { name, status: 'FAIL', detail: `videos insert failed: ${insertErr?.message}` };
    }
    videoId = video.id;

    const res = await fetch(`${BASE}/v/${videoId}`);
    if (res.status !== 200) {
      return { name, status: 'FAIL', detail: `expected 200 from /v/${videoId}, got ${res.status}` };
    }
    const html = await res.text();
    if (!html.includes(title)) {
      return { name, status: 'FAIL', detail: `/v/${videoId} HTML did not contain the title "${title}"` };
    }

    return {
      name,
      status: 'PASS',
      detail: `video created via DB layer (RLS-honoring insert); GET /v/${videoId} returned 200 with title in HTML`,
    };
  } catch (err) {
    return { name, status: 'FAIL', detail: `unexpected error: ${err?.message ?? String(err)}` };
  } finally {
    try {
      if (videoId) await admin.from('videos').delete().eq('id', videoId);
    } catch {
      // best-effort cleanup
    }
    try {
      if (userId) await admin.auth.admin.deleteUser(userId);
    } catch {
      // best-effort cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// S7: edit + soft-delete RLS
// ---------------------------------------------------------------------------
async function checkEditSoftDeleteRls() {
  const name = 'S7 edit+soft-delete RLS';
  const cfg = supabaseConfig();
  if (!cfg) {
    return { name, status: 'BLOCKED', detail: 'Supabase not configured in this environment' };
  }

  const mod = await loadSupabaseJs();
  if (mod.__error) {
    return { name, status: 'BLOCKED', detail: `@supabase/supabase-js not resolvable: ${mod.__error}` };
  }
  const { createClient } = mod;

  const admin = createClient(cfg.url, cfg.service, { auth: { persistSession: false } });
  const emailOwner = `selfcheck-owner+${Date.now()}@example.test`;
  const emailOther = `selfcheck-other+${Date.now()}@example.test`;
  const originalTitle = `Selfcheck RLS Video ${Date.now()}`;
  let ownerId;
  let otherId;
  let videoId;

  try {
    const { data: ownerCreated, error: ownerErr } = await admin.auth.admin.createUser({
      email: emailOwner,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (ownerErr || !ownerCreated?.user) {
      return { name, status: 'BLOCKED', detail: `could not create owner user: ${ownerErr?.message ?? 'unknown error'}` };
    }
    ownerId = ownerCreated.user.id;

    const { data: otherCreated, error: otherErr } = await admin.auth.admin.createUser({
      email: emailOther,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (otherErr || !otherCreated?.user) {
      return { name, status: 'BLOCKED', detail: `could not create other user: ${otherErr?.message ?? 'unknown error'}` };
    }
    otherId = otherCreated.user.id;

    const ownerClient = createClient(cfg.url, cfg.anon, { auth: { persistSession: false } });
    const otherClient = createClient(cfg.url, cfg.anon, { auth: { persistSession: false } });

    const { error: signInOwnerErr } = await ownerClient.auth.signInWithPassword({
      email: emailOwner,
      password: TEST_PASSWORD,
    });
    if (signInOwnerErr) return { name, status: 'FAIL', detail: `owner sign-in failed: ${signInOwnerErr.message}` };

    const { error: signInOtherErr } = await otherClient.auth.signInWithPassword({
      email: emailOther,
      password: TEST_PASSWORD,
    });
    if (signInOtherErr) return { name, status: 'FAIL', detail: `other-user sign-in failed: ${signInOtherErr.message}` };

    const { data: video, error: insertErr } = await ownerClient
      .from('videos')
      .insert({
        kind: 'link',
        title: originalTitle,
        external_url: 'https://example.com/selfcheck-rls',
        owner_id: ownerId,
        status: 'ready',
      })
      .select('id')
      .single();
    if (insertErr || !video) {
      return { name, status: 'FAIL', detail: `owner insert failed: ${insertErr?.message}` };
    }
    videoId = video.id;

    const { data: patchData, error: patchErr } = await otherClient
      .from('videos')
      .update({ title: 'Hacked by other user' })
      .eq('id', videoId)
      .select();
    const patchBlocked = (patchData ?? []).length === 0 || patchErr !== null;
    if (!patchBlocked) {
      return { name, status: 'FAIL', detail: 'a non-owner was able to update a video row they do not own' };
    }

    const { data: reRead } = await admin.from('videos').select('title').eq('id', videoId).single();
    if (reRead?.title !== originalTitle) {
      return { name, status: 'FAIL', detail: `title changed unexpectedly to "${reRead?.title}"` };
    }

    const { error: softDeleteErr } = await ownerClient
      .from('videos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', videoId);
    if (softDeleteErr) {
      return { name, status: 'FAIL', detail: `owner soft-delete failed: ${softDeleteErr.message}` };
    }

    const res = await fetch(`${BASE}/v/${videoId}`);
    if (res.status !== 404) {
      return { name, status: 'FAIL', detail: `expected 404 from /v/${videoId} after soft-delete, got ${res.status}` };
    }

    return {
      name,
      status: 'PASS',
      detail: 'cross-user PATCH was blocked by RLS (0 rows/error), owner soft-delete succeeded, /v/<id> now 404s',
    };
  } catch (err) {
    return { name, status: 'FAIL', detail: `unexpected error: ${err?.message ?? String(err)}` };
  } finally {
    try {
      if (videoId) await admin.from('videos').delete().eq('id', videoId);
    } catch {
      // best-effort cleanup
    }
    try {
      if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    } catch {
      // best-effort cleanup
    }
    try {
      if (otherId) await admin.auth.admin.deleteUser(otherId);
    } catch {
      // best-effort cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// S8: mobile
// ---------------------------------------------------------------------------
async function checkMobile() {
  const name = 'S8 mobile';
  try {
    const res = await fetch(BASE, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });
    if (res.status !== 200) {
      return { name, status: 'FAIL', detail: `expected 200, got ${res.status}` };
    }
    const html = await res.text();
    if (!html.includes('<meta name="viewport"')) {
      return { name, status: 'FAIL', detail: 'response body is missing a <meta name="viewport" tag' };
    }
    return { name, status: 'PASS', detail: 'homepage responded 200 with a viewport meta tag for a mobile UA' };
  } catch (err) {
    return { name, status: 'FAIL', detail: `request failed: ${err?.message ?? String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

function statusIcon(status) {
  if (status === 'PASS') return '✅';
  if (status === 'FAIL') return '❌';
  return '⏭';
}

function printTable(items) {
  const nameWidth = Math.max(20, ...items.map((i) => i.name.length));
  const rule = '-'.repeat(nameWidth + 60);
  console.log('');
  console.log('WatchDeck selfcheck results');
  console.log(rule);
  for (const item of items) {
    console.log(`${statusIcon(item.status)} ${item.status.padEnd(7)} ${item.name.padEnd(nameWidth)}  ${item.detail}`);
  }
  console.log(rule);
  console.log('');
}

async function main() {
  const results = [];

  const s1 = await checkSearch();
  results.push(s1);

  const s2 = await checkLinksLive(s1);
  results.push(s2);

  const s3 = await checkSummarize(s1);
  results.push(s3);

  const s4 = await checkAuthWatchlist();
  results.push(s4);

  const s5 = await checkUpload();
  results.push(s5);

  const s6 = await checkCreateLinkPublic();
  results.push(s6);

  const s7 = await checkEditSoftDeleteRls();
  results.push(s7);

  const s8 = await checkMobile();
  results.push(s8);

  printTable(results);

  const publicResults = results.map(({ name, status, detail }) => ({ name, status, detail }));
  console.log(`SELFCHECK_JSON:${JSON.stringify(publicResults)}`);

  const anyFail = publicResults.some((r) => r.status === 'FAIL');
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error('selfcheck crashed:', err?.stack || err?.message || String(err));
  console.log('SELFCHECK_JSON:[]');
  process.exit(1);
});
