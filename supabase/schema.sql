-- ============================================================
-- AvatarStudio — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- ============================================================

-- ------------------------------------------------------------
-- profiles: one row per auth user, created automatically.
-- Holds plan / Stripe linkage (Stripe wiring comes later).
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'creator', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- projects: one row per generated (or generating) video.
-- ------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  script text not null,
  avatar_id text not null,
  avatar_name text,
  voice_id text not null,
  voice_name text,
  language text not null,
  aspect_ratio text not null check (aspect_ratio in ('16:9', '9:16', '1:1')),
  background_color text not null default '#FFFFFF',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  provider text not null,
  provider_video_id text,
  final_video_url text,
  thumbnail_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lip-sync pipeline columns (idempotent so existing databases upgrade
-- by re-running this file).
alter table public.projects add column if not exists lipsync_provider text;
alter table public.projects add column if not exists lipsync_job_id text;
alter table public.projects add column if not exists lipsync_status text
  check (lipsync_status is null
         or lipsync_status in ('pending', 'processing', 'completed', 'failed'));
alter table public.projects add column if not exists audio_url text;
alter table public.projects add column if not exists source_avatar_url text;
alter table public.projects add column if not exists lipsynced_video_url text;

-- Avatar-engine pipeline columns (open-source animation engines).
alter table public.projects add column if not exists avatar_engine_id text;
alter table public.projects add column if not exists avatar_engine_mode text;
alter table public.projects add column if not exists avatar_engine_job_id text;
alter table public.projects add column if not exists avatar_engine_status text
  check (avatar_engine_status is null
         or avatar_engine_status in ('queued', 'processing', 'completed', 'failed'));
alter table public.projects add column if not exists avatar_engine_progress integer;
alter table public.projects add column if not exists source_audio_url text;
alter table public.projects add column if not exists source_avatar_image_url text;
alter table public.projects add column if not exists source_video_url text;
alter table public.projects add column if not exists animated_video_url text;
alter table public.projects add column if not exists engine_metadata jsonb;
alter table public.projects add column if not exists consent_confirmed boolean not null default false;

create index if not exists projects_user_id_created_at_idx
  on public.projects (user_id, created_at desc);

alter table public.projects enable row level security;

drop policy if exists "Users can view own projects" on public.projects;
create policy "Users can view own projects"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own projects" on public.projects;
create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own projects" on public.projects;
create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own projects" on public.projects;
create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- avatar_engine_jobs: audit/history of every engine job.
-- ------------------------------------------------------------
create table if not exists public.avatar_engine_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  engine_id text not null,
  job_id text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  progress integer,
  input jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists avatar_engine_jobs_project_idx
  on public.avatar_engine_jobs (project_id, created_at desc);

alter table public.avatar_engine_jobs enable row level security;

drop policy if exists "Users can view own engine jobs" on public.avatar_engine_jobs;
create policy "Users can view own engine jobs"
  on public.avatar_engine_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own engine jobs" on public.avatar_engine_jobs;
create policy "Users can insert own engine jobs"
  on public.avatar_engine_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own engine jobs" on public.avatar_engine_jobs;
create policy "Users can update own engine jobs"
  on public.avatar_engine_jobs for update
  using (auth.uid() = user_id);

drop trigger if exists avatar_engine_jobs_set_updated_at on public.avatar_engine_jobs;
create trigger avatar_engine_jobs_set_updated_at
  before update on public.avatar_engine_jobs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Optional: storage bucket for re-hosting final MP4s.
-- Provider URLs (e.g. HeyGen) expire after a while; copy finished
-- videos here if you need permanent hosting.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

drop policy if exists "Users can upload own videos" on storage.objects;
create policy "Users can upload own videos"
  on storage.objects for insert
  with check (
    bucket_id = 'videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Anyone can view videos" on storage.objects;
create policy "Anyone can view videos"
  on storage.objects for select
  using (bucket_id = 'videos');
