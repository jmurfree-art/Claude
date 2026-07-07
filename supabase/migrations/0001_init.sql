-- WatchDeck — initial schema migration
--
-- Apply via `supabase db push` or by pasting into the Supabase SQL editor.
-- Safe to re-run: every statement is idempotent (if not exists / on conflict
-- do nothing / create or replace / drop-then-create for triggers).

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ============================================================================
-- Table: public.videos
--   One row per piece of watchable content: a cached YouTube result the user
--   has saved (kind='youtube'), a user-uploaded file (kind='upload'), or an
--   arbitrary external link (kind='link').
-- ============================================================================

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('youtube', 'upload', 'link')),
  external_id text,               -- YouTube video id, only set when kind='youtube'
  storage_path text,               -- Supabase Storage object path, only set when kind='upload'
  external_url text,               -- source URL, set for kind='link' (optional for others)
  title text not null,
  description text,
  thumbnail_url text,
  duration_sec integer,
  channel text,
  owner_id uuid references auth.users (id) on delete cascade,
  tags text[] not null default '{}',
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================================
-- Table: public.watchlist
--   Join table: which users have saved which videos, with a frozen
--   WatchlistSnapshot (lib/types.ts) so cards render without a fresh fetch.
-- ============================================================================

create table if not exists public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  snapshot jsonb not null,
  added_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

-- ============================================================================
-- Indexes (spec: 3 — owner lookup, recency ordering, full-text search)
-- ============================================================================

create index if not exists videos_owner_id_idx
  on public.videos (owner_id);

create index if not exists videos_created_at_idx
  on public.videos (created_at desc);

create index if not exists videos_search_gin_idx
  on public.videos
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.videos enable row level security;
alter table public.watchlist enable row level security;

-- Policy 1: anyone (anon or authenticated) may read non-deleted videos.
-- Backs the public /v/<id> page and cross-user "public read" behavior.
create policy videos_public_read on public.videos
  for select
  using (deleted_at is null);

-- Policy 2: an owner has full CRUD over their own video rows (insert, select,
-- update — including soft delete via deleted_at — and hard delete), even
-- rows already soft-deleted. Owner-only: owner_id must equal auth.uid() on
-- both the existing row (using) and the row being written (with check).
create policy videos_owner_crud on public.videos
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Policy 3: a user has full CRUD over only their own watchlist rows.
create policy watchlist_owner_crud on public.watchlist
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- Agent E additions (beyond the base spec schema above)
-- ============================================================================

-- Unique partial index: one videos row per YouTube id, used as the upsert
-- target by POST /api/watchlist (select-by-external_id-then-insert, with a
-- 23505 unique-violation retry path as a race-safety net).
create unique index if not exists videos_youtube_external_id_uidx
  on public.videos (external_id)
  where kind = 'youtube';

-- updated_at trigger: keep videos.updated_at current on every UPDATE,
-- independent of whatever fields a given route sets explicitly.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at
  before update on public.videos
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- Storage: 'user-videos' bucket + per-user-folder object policies
--   Uploaded files live at <owner user id>/<filename>. Bucket is private;
--   all reads go through the signed-url route (GET /api/videos/[id]/signed-url).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('user-videos', 'user-videos', false)
on conflict (id) do nothing;

-- Authenticated users may upload into their own folder (first path segment
-- must equal their auth.uid()).
create policy user_videos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'user-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may read objects in their own folder. (Public/anon
-- playback goes through the service-role signed-url route instead, which
-- bypasses this policy entirely.)
create policy user_videos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may overwrite/update metadata of objects in their own
-- folder.
create policy user_videos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'user-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may delete objects in their own folder.
create policy user_videos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'user-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
