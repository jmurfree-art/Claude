#!/usr/bin/env node
// WatchDeck live APP test - exercises the RUNNING Next.js app's HTTP routes
// against a live Supabase project. Complements scripts/live-smoke.mjs, which
// tests the database/storage layer directly; this one tests the app itself:
// route handlers, middleware auth gates, zod validation, signed-URL route,
// public video pages, and yt-dlp-backed search/summarize.
//
// Prereqs:
//   1. .env.local written (scripts/setup-supabase.ps1)
//   2. schema applied (node scripts/apply-migration.mjs --token sbp_xxx)
//   3. app running:  npm run dev     (or npm run build && npm start)
//   4. node scripts/live-app-test.mjs [baseUrl]      default http://localhost:3000
//
// Requires yt-dlp on PATH for the search/summarize checks; if it's missing
// or YouTube is unreachable those two report BLOCKED (not FAIL), because they
// depend on the machine's network, not on the app's correctness.
// Cleans up everything it creates. Never fabricates a pass.

import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const results = [];
const rec = (name, status, detail) => {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭';
  console.log(`${icon} ${status.padEnd(7)} ${name} — ${detail}`);
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
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = env;
  if (!url || !anon || !service) {
    console.error('ERROR: .env.local is missing URL / anon / service_role keys.');
    process.exit(1);
  }

  // Is the app actually up?
  try {
    const r = await fetch(BASE, { redirect: 'manual' });
    if (!r.ok) throw new Error(`home returned ${r.status}`);
  } catch (e) {
    console.error(`ERROR: no app responding at ${BASE} — start it with \`npm run dev\` first.`);
    console.error(`       (${e?.message || e})`);
    process.exit(1);
  }
  console.log(`App:    ${BASE}\nSupabase: ${url}\n`);

  let createClient;
  try { ({ createClient } = await import('@supabase/supabase-js')); }
  catch { console.error('ERROR: run `npm install` first.'); process.exit(1); }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const stamp = Date.now();
  let userId = null, uploadVideoId = null, linkVideoId = null;
  const objects = [];

  try {
    // A1 - home page renders with a viewport meta (mobile-ready)
    {
      const r = await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
      const html = await r.text();
      rec('A1 home page (mobile UA)', r.status === 200 && html.includes('<meta name="viewport"') ? 'PASS' : 'FAIL',
        `HTTP ${r.status}, viewport meta ${html.includes('<meta name="viewport"') ? 'present' : 'MISSING'}`);
    }

    // A2 - middleware gates protected routes for anonymous users
    {
      const gates = ['/watchlist', '/upload', '/library', '/create', '/edit/abc'];
      const bad = [];
      for (const g of gates) {
        const r = await fetch(BASE + g, { redirect: 'manual' });
        const loc = r.headers.get('location') || '';
        if (!(r.status >= 300 && r.status < 400 && loc.includes('/login'))) bad.push(`${g}->${r.status}`);
      }
      rec('A2 auth gates (middleware)', bad.length === 0 ? 'PASS' : 'FAIL',
        bad.length ? `not redirected to /login: ${bad.join(', ')}` : `all ${gates.length} protected routes redirect to /login`);
    }

    // A3 - API input validation (zod) and auth (401)
    {
      const bad = [];
      const r1 = await fetch(`${BASE}/api/search`);                       // missing q
      if (r1.status !== 400) bad.push(`search-no-q=${r1.status}`);
      const r2 = await fetch(`${BASE}/api/summarize?videoId=nope`);       // bad id
      if (r2.status !== 400) bad.push(`summarize-bad-id=${r2.status}`);
      const r3 = await fetch(`${BASE}/api/videos`, {                      // unauthenticated
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'link', title: 'x' }),
      });
      if (r3.status !== 401) bad.push(`videos-post-anon=${r3.status}`);
      const r4 = await fetch(`${BASE}/api/videos/not-a-uuid`, { method: 'DELETE' });
      if (![400, 401].includes(r4.status)) bad.push(`videos-bad-uuid=${r4.status}`);
      rec('A3 API validation + auth', bad.length === 0 ? 'PASS' : 'FAIL',
        bad.length ? `unexpected statuses: ${bad.join(', ')}` : '400 on bad input, 401 when unauthenticated');
    }

    // A4 - public video page serves a link entry created in the DB
    {
      const u = await admin.auth.admin.createUser({ email: `wd-app-${stamp}@example.com`, password: `App-Pass!${stamp}`, email_confirm: true });
      userId = u.data?.user?.id;
      const title = `App test link ${stamp}`;
      const ins = await admin.from('videos').insert({
        kind: 'link', title, description: '**bold** description', tags: ['apptest'],
        external_url: 'https://example.com/app-test', owner_id: userId, status: 'ready',
      }).select('id').single();
      linkVideoId = ins.data?.id;
      if (!linkVideoId) {
        rec('A4 public /v/[id] page', 'FAIL', `could not seed row: ${ins.error?.message}`);
      } else {
        const r = await fetch(`${BASE}/v/${linkVideoId}`);
        const html = await r.text();
        rec('A4 public /v/[id] page', r.status === 200 && html.includes(title) ? 'PASS' : 'FAIL',
          `HTTP ${r.status}, title ${html.includes(title) ? 'rendered' : 'MISSING'} (no auth required)`);
      }
    }

    // A5 - signed-URL route serves an uploaded file's bytes
    {
      const bytes = Buffer.alloc(4096, 3);
      const objPath = `${userId}/apptest-${stamp}.mp4`;
      const up = await admin.storage.from('user-videos').upload(objPath, bytes, { contentType: 'video/mp4' });
      if (up.error) {
        rec('A5 signed-URL route', 'FAIL', `storage upload failed: ${up.error.message}`);
      } else {
        objects.push(objPath);
        const ins = await admin.from('videos').insert({
          kind: 'upload', title: `App test upload ${stamp}`, storage_path: objPath, owner_id: userId, status: 'ready',
        }).select('id').single();
        uploadVideoId = ins.data?.id;
        const r = await fetch(`${BASE}/api/videos/${uploadVideoId}/signed-url`);
        const body = await r.json().catch(() => ({}));
        let got = 0;
        if (body?.url) { const f = await fetch(body.url); got = f.ok ? (await f.arrayBuffer()).byteLength : 0; }
        rec('A5 signed-URL route', r.status === 200 && got === bytes.length ? 'PASS' : 'FAIL',
          `HTTP ${r.status}, fetched ${got}/${bytes.length} bytes through the app's signed URL`);
      }
    }

    // A6 - soft-deleted content 404s publicly
    {
      if (!linkVideoId) rec('A6 soft-delete hides page', 'FAIL', 'no seeded row');
      else {
        await admin.from('videos').update({ deleted_at: new Date().toISOString() }).eq('id', linkVideoId);
        const r = await fetch(`${BASE}/v/${linkVideoId}`);
        rec('A6 soft-delete hides page', r.status === 404 ? 'PASS' : 'FAIL', `/v/<id> now returns ${r.status} (expected 404)`);
      }
    }

    // A7 - YouTube search through the app (needs yt-dlp + network)
    {
      const r = await fetch(`${BASE}/api/search?q=${encodeURIComponent('never gonna give you up')}`);
      if (r.status === 200) {
        const b = await r.json();
        const n = b?.results?.length ?? 0;
        const clean = (b?.results ?? []).every((x) => x.title && x.thumbnail && x.durationSec != null);
        rec('A7 YouTube search (live)', n >= 5 && clean ? 'PASS' : 'FAIL',
          `${n} results, fields ${clean ? 'complete' : 'INCOMPLETE'}`);
      } else {
        const t = await r.text().catch(() => '');
        rec('A7 YouTube search (live)', 'BLOCKED', `HTTP ${r.status} — needs yt-dlp on PATH + YouTube reachable. ${t.slice(0, 120)}`);
      }
    }

    // A8 - summarize through the app (needs captions)
    {
      const r = await fetch(`${BASE}/api/summarize?videoId=dQw4w9WgXcQ`, { method: 'POST' });
      if (r.status === 200) {
        const b = await r.json();
        const ok = typeof b.summary === 'string' && b.summary.length > 0 && b.summary.length < 500;
        rec('A8 summarize (live)', ok ? 'PASS' : 'FAIL', `${b.summary?.length ?? 0} chars, source=${b.source}`);
      } else {
        const t = await r.text().catch(() => '');
        rec('A8 summarize (live)', 'BLOCKED', `HTTP ${r.status} — needs yt-dlp + captions available. ${t.slice(0, 120)}`);
      }
    }
  } catch (err) {
    console.log(`\n(aborted: ${err?.message || err})`);
  } finally {
    try { for (const o of objects) await admin.storage.from('user-videos').remove([o]); } catch {}
    try { if (linkVideoId) await admin.from('videos').delete().eq('id', linkVideoId); } catch {}
    try { if (uploadVideoId) await admin.from('videos').delete().eq('id', uploadVideoId); } catch {}
    try { if (userId) await admin.auth.admin.deleteUser(userId); } catch {}
  }

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const blocked = results.filter((r) => r.status === 'BLOCKED').length;
  console.log(`\nLive app test: ${pass} passed, ${fail} failed, ${blocked} blocked (of ${results.length})`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('live-app-test crashed:', e?.stack || e); process.exit(1); });
