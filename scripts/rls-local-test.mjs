#!/usr/bin/env node
// WatchDeck RLS policy verification against embedded Postgres (PGlite).
//
// This runs the REAL policy/table/trigger SQL from
// supabase/migrations/0001_init.sql inside a genuine Postgres engine
// (PGlite = Postgres compiled to WASM) and asserts the row-level-security
// semantics the app depends on. Supabase-specific pieces that cannot exist
// outside a Supabase project are shimmed or skipped, and the shim is
// disclosed in the output:
//   - auth.users        -> minimal local table
//   - auth.uid()        -> reads the `app.uid` session GUC
//   - storage.* bucket/policies -> SKIPPED (requires Supabase Storage)
//   - GoTrue sign-up/sign-in    -> out of scope here (requires live project)
//
// What this DOES verify, using the migration's verbatim policies
// ("videos read all", "videos owner write", "watchlist self"):
//   R1  owner can insert their own videos row
//   R2  a user CANNOT insert a videos row owned by someone else (WITH CHECK)
//   R3  any authenticated user can read another user's non-deleted video
//   R4  a non-owner CANNOT update someone else's video (0 rows affected)
//   R5  a non-owner CANNOT soft-delete someone else's video
//   R6  owner adds a watchlist row for themselves
//   R7  a user CANNOT insert a watchlist row for another user (WITH CHECK)
//   R8  a user cannot see another user's watchlist rows (0 rows)
//   R9  a user cannot delete another user's watchlist rows (row survives)
//   R10 owner soft-delete works; the video disappears from others' reads
//   R11 owner still sees their own soft-deleted row ("videos owner write")
//   R12 updated_at trigger fires on UPDATE
//
// Usage: node scripts/rls-local-test.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATION = path.join(process.cwd(), 'supabase', 'migrations', '0001_init.sql');

const results = [];
function record(name, ok, detail) {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name} — ${detail}`);
}

/**
 * Strip the Supabase-Storage-only statements from the migration SQL.
 * Statement-splitting SQL naively is fragile ($$ bodies, inline comments), so
 * this works textually: drop the `create extension` line (gen_random_uuid()
 * is core Postgres 13+), and truncate the file at the storage section, which
 * is the final block of the migration.
 */
function stripStorageStatements(sql) {
  let skipped = 0;
  let out = sql.replace(/^create extension[^\n]*$/gim, () => {
    skipped++;
    return '-- (create extension skipped for PGlite)';
  });
  const storageIdx = out.toLowerCase().indexOf('insert into storage.buckets');
  if (storageIdx !== -1) {
    // Back up to the banner/comment block introducing the storage section.
    const cutAt = out.lastIndexOf('-- ====', storageIdx);
    out = out.slice(0, cutAt === -1 ? storageIdx : cutAt);
    skipped++; // the whole storage tail (bucket + 4 policies)
  }
  if (/storage\.(buckets|objects)/i.test(out)) {
    throw new Error('storage statements survived stripping — aborting');
  }
  return { sql: out, skipped };
}

async function main() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();

  // --- Supabase shims -------------------------------------------------------
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    -- Shim of Supabase's auth.uid(): resolves the current user from a
    -- session GUC instead of a JWT claim. Same signature, same usage sites.
    create function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    -- Non-superuser role so RLS is actually enforced.
    create role app_user nologin;
    grant usage on schema public, auth to app_user;
  `);

  // --- Apply the real migration (minus storage-only statements) -------------
  const rawSql = await fs.readFile(MIGRATION, 'utf8');
  const { sql: migrationSql, skipped } = stripStorageStatements(rawSql);
  await db.exec(migrationSql);
  console.log(
    `applied supabase/migrations/0001_init.sql via PGlite ` +
      `(${skipped} storage/extension statements skipped — Supabase-only)`,
  );

  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to app_user;
  `);

  // --- Two local "users" ----------------------------------------------------
  const userA = randomUUID();
  const userB = randomUUID();
  await db.exec(`insert into auth.users (id) values ('${userA}'), ('${userB}');`);

  async function as(uid, sql) {
    // Single-connection engine: emulate a user-scoped client by switching to
    // the non-superuser role + setting the auth.uid() GUC for this statement
    // batch, then switching back.
    await db.exec(`set role app_user; select set_config('app.uid', '${uid}', false);`);
    try {
      return await db.query(sql);
    } finally {
      await db.exec(`reset role; select set_config('app.uid', '', false);`);
    }
  }
  async function admin(sql) {
    return db.query(sql);
  }

  // R1: owner inserts own video
  let videoId = null;
  try {
    const r = await as(
      userA,
      `insert into public.videos (kind, title, external_url, owner_id, status)
       values ('link', 'RLS local test video', 'https://example.com/rls', '${userA}', 'ready')
       returning id`,
    );
    videoId = r.rows[0]?.id ?? null;
    record('R1 owner insert', !!videoId, videoId ? `videos row ${videoId}` : 'no row returned');
  } catch (err) {
    record('R1 owner insert', false, String(err?.message ?? err));
  }

  // R2: cannot insert a row owned by someone else
  try {
    await as(
      userA,
      `insert into public.videos (kind, title, owner_id) values ('link', 'forged owner', '${userB}')`,
    );
    record('R2 forged-owner insert blocked', false, 'insert with owner_id=<other user> was allowed');
  } catch (err) {
    const msg = String(err?.message ?? err);
    record('R2 forged-owner insert blocked', /row-level security/i.test(msg), msg.slice(0, 90));
  }

  // R3: other user can read the non-deleted video
  {
    const r = await as(userB, `select id, title from public.videos where id = '${videoId}'`);
    record('R3 public read', r.rows.length === 1, `user B sees ${r.rows.length} row(s)`);
  }

  // R4: non-owner update affects 0 rows
  {
    const r = await as(
      userB,
      `update public.videos set title = 'hacked' where id = '${videoId}' returning id`,
    );
    const after = await admin(`select title from public.videos where id = '${videoId}'`);
    const ok = r.rows.length === 0 && after.rows[0]?.title === 'RLS local test video';
    record('R4 cross-user update blocked', ok, `updated ${r.rows.length} rows; title="${after.rows[0]?.title}"`);
  }

  // R5: non-owner soft-delete affects 0 rows
  {
    const r = await as(
      userB,
      `update public.videos set deleted_at = now() where id = '${videoId}' returning id`,
    );
    const after = await admin(`select deleted_at from public.videos where id = '${videoId}'`);
    const ok = r.rows.length === 0 && after.rows[0]?.deleted_at === null;
    record('R5 cross-user soft-delete blocked', ok, `updated ${r.rows.length} rows; deleted_at=${after.rows[0]?.deleted_at}`);
  }

  // R6: owner adds own watchlist row
  try {
    const r = await as(
      userA,
      `insert into public.watchlist (user_id, video_id, snapshot)
       values ('${userA}', '${videoId}', '{"videoId":"x","title":"t","thumbnail":"","channel":"","durationSec":null,"url":"https://example.com"}')
       returning user_id`,
    );
    record('R6 own watchlist insert', r.rows.length === 1, `${r.rows.length} row inserted`);
  } catch (err) {
    record('R6 own watchlist insert', false, String(err?.message ?? err));
  }

  // R7: cannot insert a watchlist row for another user
  try {
    await as(
      userB,
      `insert into public.watchlist (user_id, video_id, snapshot)
       values ('${userA}', '${videoId}', '{}')`,
    );
    record('R7 forged watchlist insert blocked', false, 'insert for another user was allowed');
  } catch (err) {
    const msg = String(err?.message ?? err);
    record('R7 forged watchlist insert blocked', /row-level security/i.test(msg), msg.slice(0, 90));
  }

  // R8: watchlist is invisible cross-user
  {
    const r = await as(userB, `select * from public.watchlist where user_id = '${userA}'`);
    record('R8 watchlist isolation (read)', r.rows.length === 0, `user B sees ${r.rows.length} row(s)`);
  }

  // R9: watchlist cannot be deleted cross-user
  {
    const r = await as(
      userB,
      `delete from public.watchlist where user_id = '${userA}' returning user_id`,
    );
    const after = await admin(`select count(*)::int as n from public.watchlist where user_id = '${userA}'`);
    const ok = r.rows.length === 0 && after.rows[0]?.n === 1;
    record('R9 watchlist isolation (delete)', ok, `deleted ${r.rows.length}; ${after.rows[0]?.n} row(s) survive`);
  }

  // R10: owner soft-delete hides the video from others
  {
    const del = await as(
      userA,
      `update public.videos set deleted_at = now() where id = '${videoId}' returning id`,
    );
    const r = await as(userB, `select id from public.videos where id = '${videoId}'`);
    const ok = del.rows.length === 1 && r.rows.length === 0;
    record('R10 owner soft-delete hides row', ok, `owner updated ${del.rows.length}; user B now sees ${r.rows.length}`);
  }

  // R11: owner still sees their own soft-deleted row
  {
    const r = await as(userA, `select id from public.videos where id = '${videoId}'`);
    record('R11 owner sees own deleted row', r.rows.length === 1, `owner sees ${r.rows.length} row(s)`);
  }

  // R12: updated_at trigger fired during R10's update
  {
    const r = await admin(
      `select (updated_at > created_at) as bumped from public.videos where id = '${videoId}'`,
    );
    record('R12 updated_at trigger', r.rows[0]?.bumped === true, `updated_at > created_at: ${r.rows[0]?.bumped}`);
  }

  const fails = results.filter((r) => r.status === 'FAIL');
  console.log('');
  console.log(`RLS local verification: ${results.length - fails.length}/${results.length} passed`);
  console.log(
    'NOT covered here (requires a live Supabase project): GoTrue auth flows, ' +
      'Storage bucket policies, signed URLs.',
  );
  console.log(`RLS_LOCAL_JSON:${JSON.stringify(results)}`);
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('rls-local-test crashed:', err?.stack || String(err));
  process.exit(1);
});
