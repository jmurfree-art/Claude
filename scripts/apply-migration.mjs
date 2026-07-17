#!/usr/bin/env node
// WatchDeck - apply supabase/migrations/0001_init.sql to a live Supabase
// project via the Management API. Pure Node (no deps), Windows-friendly.
//
// Usage:
//   node scripts/apply-migration.mjs --token sbp_xxx
//   (or set SUPABASE_ACCESS_TOKEN instead of --token)
//
// The project ref is derived from NEXT_PUBLIC_SUPABASE_URL in .env.local
// (written by scripts/setup-supabase.ps1). Tries the whole file first; if
// the API rejects it, falls back to running statements one at a time
// (respecting $$ ... $$ function bodies), tolerating "already exists"
// errors so re-runs are safe. Finishes by verifying the tables and the
// storage bucket actually exist.

import fs from 'node:fs';
import path from 'node:path';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const token = arg('--token') || process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('ERROR: pass --token sbp_xxx (or set SUPABASE_ACCESS_TOKEN).');
  process.exit(1);
}

const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env.local not found - run scripts/setup-supabase.ps1 first.');
  process.exit(1);
}
const envText = fs.readFileSync(envPath, 'utf8');
const urlMatch = envText.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/);
if (!urlMatch) {
  console.error('ERROR: could not find NEXT_PUBLIC_SUPABASE_URL in .env.local.');
  process.exit(1);
}
const ref = urlMatch[1];
console.log(`Project ref: ${ref}`);

const migPath = path.join(process.cwd(), 'supabase', 'migrations', '0001_init.sql');
const sql = fs.readFileSync(migPath, 'utf8');

async function runQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

/** Split SQL into top-level statements, respecting $$ ... $$ bodies. */
function splitStatements(text) {
  const out = [];
  let buf = '';
  let inDollar = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && text[i + 1] === '$') {
      inDollar = !inDollar;
      buf += '$$';
      i++;
      continue;
    }
    if (text[i] === ';' && !inDollar) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += text[i];
  }
  if (buf.trim()) out.push(buf.trim());
  // Drop pure-comment statements
  return out.filter((s) => s.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')));
}

async function main() {
  console.log('==> Trying whole-file migration...');
  const whole = await runQuery(sql);
  if (whole.ok) {
    console.log('    applied in one shot');
  } else {
    console.log(`    whole-file rejected (HTTP ${whole.status}): ${whole.body.slice(0, 300)}`);
    console.log('==> Falling back to statement-by-statement...');
    const stmts = splitStatements(sql);
    let okCount = 0, skipCount = 0, failCount = 0;
    for (const [i, stmt] of stmts.entries()) {
      const r = await runQuery(stmt);
      const label = stmt.replace(/\s+/g, ' ').slice(0, 70);
      if (r.ok) {
        okCount++;
        console.log(`    [${i + 1}/${stmts.length}] ok      ${label}`);
      } else if (/already exists|duplicate/i.test(r.body)) {
        skipCount++;
        console.log(`    [${i + 1}/${stmts.length}] exists  ${label}`);
      } else {
        failCount++;
        console.log(`    [${i + 1}/${stmts.length}] FAILED  ${label}`);
        console.log(`        HTTP ${r.status}: ${r.body.slice(0, 300)}`);
      }
    }
    console.log(`    done: ${okCount} applied, ${skipCount} already existed, ${failCount} failed`);
    if (failCount > 0) {
      console.log('    Some statements failed - see errors above. You can paste the file');
      console.log('    into the Supabase dashboard SQL editor as a fallback.');
    }
  }

  console.log('==> Verifying schema...');
  const checks = [
    ["videos table", "select count(*) from public.videos"],
    ["watchlist table", "select count(*) from public.watchlist"],
    ["user-videos bucket", "select id from storage.buckets where id = 'user-videos'"],
    ["RLS policies", "select count(*) from pg_policies where tablename in ('videos','watchlist')"],
  ];
  let allOk = true;
  for (const [name, q] of checks) {
    const r = await runQuery(q);
    if (r.ok) {
      console.log(`    ok  ${name}  -> ${r.body.slice(0, 60)}`);
    } else {
      allOk = false;
      console.log(`    !!  ${name}  -> HTTP ${r.status}: ${r.body.slice(0, 200)}`);
    }
  }

  if (allOk) {
    console.log('\nMigration verified. Next: node scripts/live-smoke.mjs');
    process.exit(0);
  } else {
    console.log('\nSchema incomplete - fix the failures above (or use the SQL editor).');
    process.exit(1);
  }
}

main().catch((e) => { console.error('apply-migration crashed:', e?.message || e); process.exit(1); });
