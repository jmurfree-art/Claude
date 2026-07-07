# WatchDeck

WatchDeck is a small, self-hostable app for searching YouTube, saving results
to a personal watchlist, uploading your own video files, and sharing simple
public video pages — all backed by Supabase (Postgres + Auth + Storage) and
`yt-dlp`.

## Features

- **Search** YouTube without an account, with infinite scroll and result
  cards (thumbnail, title, channel, duration, view count).
- **Watchlist**: save/remove YouTube results with one tap; saved items are
  validated for availability when you revisit the page.
- **Summarize**: an on-demand, extractive summary of a YouTube video's
  captions (falling back to its description) — no external LLM call.
- **Upload**: sign in and upload your own `.mp4`/`.webm`/`.mov` files
  (resumable upload via `tus`) into a private Supabase Storage bucket.
- **Create / Library / Edit**: create link-based video entries, manage your
  own videos, edit metadata, and soft-delete.
- **Public video pages** at `/v/<id>` for anything you've uploaded or linked.

## Stack

- Next.js 14 (App Router), TypeScript (strict), Tailwind CSS
- Supabase: Postgres, Auth, Storage (`@supabase/ssr`, `@supabase/supabase-js`)
- `yt-dlp` for YouTube search/metadata/captions (shelled out via
  `child_process.execFile`, never a shell string)
- `zod` for request validation, `vitest` for tests
- pnpm, Node 20+

## Prerequisites

- Node 20+
- pnpm
- `yt-dlp` on your `PATH` (required for real YouTube search/metadata; not
  required if you only run the self-check in mock mode)
- Optional: `ffprobe` (used to best-effort probe the duration of uploaded
  files; the app degrades gracefully if it's absent)

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a Supabase project (or reuse an existing one).

3. Apply the schema migration at `supabase/migrations/0001_init.sql` — either
   via the Supabase CLI:

   ```bash
   supabase db push
   ```

   or by pasting its contents into the Supabase dashboard's SQL editor and
   running it. This single migration creates the `videos` and `watchlist`
   tables, their indexes (including a full-text search GIN index), enables
   Row Level Security with the owner/public-read policies, **and also
   creates the `user-videos` Storage bucket and its four
   insert/select/update/delete policies** — there is no separate manual
   bucket-creation step.

4. In your Supabase project's Auth settings, either disable "Confirm email"
   for frictionless local sign-up/sign-in, or leave it enabled and confirm
   each test account's email manually (or via the Supabase dashboard) before
   signing in.

5. Copy `.env.example` to `.env.local` and fill in the values:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Required | Description |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | for auth/watchlist/upload features | Supabase project URL. Safe to expose to the browser. |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for auth/watchlist/upload features | Supabase anon/public API key. Safe to expose to the browser. |
   | `SUPABASE_SERVICE_ROLE_KEY` | for upload/signed-url/admin routes | Service-role key. **Server-only** — never expose to the browser. |
   | `YTDLP_BIN` | no (default `yt-dlp`) | Path to the `yt-dlp` binary. |
   | `YTDLP_COOKIES_PATH` | no | Optional cookies file passed to `yt-dlp --cookies`. |
   | `TRANSCRIPT_TMP_DIR` | no (default `/tmp/watchdeck-transcripts`) | Scratch directory for downloaded subtitle files. |
   | `YTDLP_MOCK` | no | Set to `1` to run `scripts/mock-yt-dlp.mjs` instead of the real `yt-dlp` binary (used by the self-check's mock mode and useful in any sandbox without YouTube egress). |

   The app boots and serves `/`, `/api/search`, and `/api/summarize` even
   with the Supabase variables unset — auth-dependent features (watchlist,
   upload, library, create/edit) degrade gracefully to a "not configured" or
   login-redirect state instead of crashing.

6. Run the dev server:

   ```bash
   pnpm dev
   ```

## Self-check

`scripts/selfcheck.sh` installs, builds, lints, and tests the project, then
boots a production server on port 3111 and drives it through a real
end-to-end checklist (search, summarize, auth, watchlist, upload, public
video pages, cross-user RLS, mobile viewport) via `scripts/selfcheck.mjs`.

```bash
bash scripts/selfcheck.sh
```

- `SELFCHECK_MODE=mock` (default): runs against `scripts/mock-yt-dlp.mjs`
  instead of the real `yt-dlp` binary — useful in sandboxes where YouTube
  egress is blocked. Search/summarize checks run against deterministic mock
  data; the live-link-liveness check reports **BLOCKED** with an explicit
  reason instead of a fake pass.
- `SELFCHECK_MODE=live`: runs against the real `yt-dlp` binary and also
  verifies that YouTube result URLs are actually reachable.

  ```bash
  SELFCHECK_MODE=live bash scripts/selfcheck.sh
  ```

Any check that needs Supabase (auth, watchlist, upload, public video pages
created through the DB layer, cross-user RLS) reports **BLOCKED** with an
explicit reason — never a fabricated PASS — when
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` aren't set.

The full report is written to `selfcheck-report.txt` at the repo root (and
printed to stdout at the end of the run). The script exits non-zero if any
check genuinely **FAILs**; **BLOCKED** checks do not fail the run.

## ⚠️ No moderation, no quotas (MVP)

This MVP intentionally ships **without** any per-user storage quota,
moderation queue, or content review:

- Any authenticated user can upload **up to 500 MB per file**, with **no
  cap on the number of files or total storage** they use.
- Uploaded content has **no moderation queue** — files are immediately
  playable via a signed URL once the upload finishes.
- Users have **full CRUD** on their own uploads (create, edit metadata,
  soft-delete) with no additional approval step.
- **Public, unauthenticated viewing** is enabled by default at `/v/<id>`
  for any non-deleted upload or link.

**Operator implications:** the operator bears the Supabase Storage cost of
whatever gets uploaded, and bears legal/content-liability exposure for
anything hosted at a public `/v/<id>` URL, since there is no review step
before content becomes publicly viewable.

**Recommended post-MVP hardening:**

- A per-user quota (e.g. 5 videos / 2 GB), enforced both client-side (before
  starting a `tus` upload) and server-side (checked in `POST /api/videos`
  before finalizing an upload, and ideally as a Postgres trigger/RPC so it
  can't be bypassed by calling Supabase directly).
- Basic content scanning (e.g. a hash-based or perceptual-hash check against
  known-bad content, or a manual review queue before a video becomes
  publicly visible).

### Nightly hard-purge of soft-deleted videos (not yet implemented)

`DELETE /api/videos/[id]` only **soft-deletes** (sets `deleted_at`); rows and
their storage objects are never actually removed. There is currently no
scheduled job that hard-purges old soft-deleted rows — this is intentionally
left as an operational task for whoever deploys WatchDeck. A reasonable
approach:

```sql
-- Hard-purge videos rows that have been soft-deleted for 30+ days.
-- Run this on a schedule (see below). Storage objects for kind='upload'
-- rows must be removed separately (e.g. via a small edge function that
-- calls storage.remove([storage_path]) for each row before/after this
-- delete), since SQL alone cannot delete Storage objects.
delete from public.videos
where deleted_at is not null
  and deleted_at < now() - interval '30 days';
```

Two ways to schedule it:

- **`pg_cron`** (if enabled on your Supabase project): schedule the SQL
  above directly, and pair it with a Storage cleanup step (pg_cron can also
  invoke a Postgres function that calls out via `pg_net`/an edge function to
  remove the corresponding Storage objects first).
- **A scheduled Supabase Edge Function** (or any external scheduler hitting
  a protected route) that: lists soon-to-purge rows, deletes their Storage
  objects via the service-role client, then deletes the rows.

## Known limitations

- **Thumbnails are URL-only** in the create/edit form — there is no
  thumbnail *file* upload in v1. (The card UI otherwise supports both, this
  is a deliberate v1 scope cut.)
- **Uploaded files are immutable** — there is no "replace file" flow for an
  existing upload; the edit form shows a disabled label for uploads instead
  of an actionable control.
- **No transcoding.** The only processing performed on an uploaded file is a
  best-effort `ffprobe` duration probe; if `ffprobe` isn't installed, the
  duration is simply left `null`.
- **YouTube result caching is minimal** — searches and metadata fetches hit
  `yt-dlp` directly each time; there's no persistent cache layer yet.
- **Live YouTube reachability checks and hosted-Supabase checks are
  environment-dependent.** In sandboxes without YouTube egress or without a
  configured Supabase project, `scripts/selfcheck.sh` reports the affected
  checks as **BLOCKED** with an explicit reason rather than skipping them
  silently or faking a pass.
- **The summarizer is extractive, not generative** — it's a deterministic,
  frequency-based sentence-scoring algorithm (no external LLM call), and is
  English-oriented (stopword list, sentence-boundary heuristics).
