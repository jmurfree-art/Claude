# AvatarStudio

Turn a script into a presenter-led MP4. AvatarStudio is a production-ready
AI avatar video generator: write what you want said, pick an avatar, voice,
language, background, and aspect ratio, then download the finished video.

Built with **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS +
shadcn/ui · Supabase (auth, database, storage) · provider-agnostic video
generation** (HeyGen first, with a mock mode and an experimental self-hosted
Duix-Avatar provider).

> AvatarStudio is an original app. It is not affiliated with HeyGen and does
> not use HeyGen branding, UI, or assets — HeyGen is simply the first
> supported rendering API.

---

## Features

- **Email/password auth** with protected routes (Supabase + middleware)
- **Create flow**: script input, avatar picker, voice picker (filtered by
  language), background color, aspect ratio (16:9 / 9:16 / 1:1)
- **Render pipeline**: server-side provider call → status polling →
  MP4 preview and download
- **Project history**: every render saved per-user with status badges
- **Pages**: landing, login/signup, dashboard, create, project detail,
  settings/API usage, billing placeholder (Stripe-ready plan structure)
- **Safety**: consent confirmation before generation, moderation placeholder,
  impersonation language blocked
- **Mock mode**: no API key needed to develop — the full flow runs against a
  simulated provider

## Quick start

### 1. Clone & install

```bash
git clone <this-repo>
cd <this-repo>
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql),
   and run it. This creates:
   - `profiles` (auto-created per user via trigger, holds plan + Stripe fields)
   - `projects` (one row per video) with row-level security
   - a public `videos` storage bucket (optional, for re-hosting MP4s)
3. In **Authentication → Providers**, make sure **Email** is enabled.
   For local development you may want to disable "Confirm email" so signups
   log in immediately.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (safe for browser) |
| `NEXT_PUBLIC_APP_URL` | ✅ | e.g. `http://localhost:3000` |
| `HEYGEN_API_KEY` | ⬜ | Real renders via HeyGen. Empty = **mock mode** |
| `VIDEO_PROVIDER` | ⬜ | Force `heygen`, `duix`, or `mock` |
| `DUIX_*` | ⬜ | Only for the experimental Duix provider (below) |
| `STRIPE_*` | ⬜ | Placeholders — billing not wired up yet |

**No secret is ever hardcoded; provider calls run server-side only** (the
provider modules import `server-only`, so bundling them into client code
fails the build).

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000, sign up, and create a video. Without a
`HEYGEN_API_KEY` the mock provider simulates a ~16-second render and returns
a sample MP4 — ideal for developing the UI and polling flow.

### 5. Production build

```bash
npm run build && npm start
```

Deploys cleanly to Vercel or any Node host. Set the same env vars there.

---

## Architecture

```
app/
  page.tsx                     Landing
  login/ · signup/             Auth pages (Supabase email/password)
  auth/callback/route.ts       Email-confirmation exchange
  (app)/                       Protected shell (nav + auth guard)
    dashboard/                 Project list with status badges
    create/                    Script → avatar → voice → generate
    projects/[id]/             Detail page with live render polling
    settings/                  Account, usage, active provider
    billing/                   Plan cards (Stripe placeholder)
  api/
    avatars/ · voices/         Provider catalogs (auth required)
    videos/                    POST — moderation → provider → save project
    videos/[id]/status/        GET — poll provider, persist transitions
components/                    UI (shadcn-style) + feature components
lib/
  supabase/                    Browser/server/middleware clients
  video-providers/             ← provider abstraction (see below)
  moderation.ts                Placeholder content gate
  billing/plans.ts             Stripe-ready plan catalog
supabase/schema.sql            Full database schema + RLS
middleware.ts                  Session refresh + route protection
```

### Provider abstraction

All rendering goes through one interface (`lib/video-providers/types.ts`):

```ts
interface VideoProvider {
  name: string;
  listAvatars(): Promise<Avatar[]>;
  listVoices(): Promise<Voice[]>;
  createVideo(input: CreateVideoInput): Promise<CreateVideoResult>;
  getVideoStatus(id: string): Promise<VideoStatusResult>;
}
```

| Provider | File | Status |
| --- | --- | --- |
| **Local (free)** | `lib/video-providers/local.ts` | ✅ Real MP4s with no API key or subscription — see below |
| **HeyGen** | `lib/video-providers/heygen.ts` | ✅ v2 avatars/voices/generate + v1 status polling |
| **Mock** | `lib/video-providers/mock.ts` | ✅ Simulated pipeline for development |
| **Duix-Avatar** | `lib/video-providers/duix.ts` | 🧪 Experimental self-hosted option |

Selection happens in `lib/video-providers/index.ts`: `VIDEO_PROVIDER` env var
wins; otherwise HeyGen when `HEYGEN_API_KEY` is set; **otherwise the free
local provider**. Adding a new vendor = one new class + one registry entry.
The rest of the app never changes.

### Free renders without HeyGen (the default)

No paid subscription is needed to produce real videos. The `local` provider
renders MP4s entirely with free components:

- **Voice**: Microsoft Edge's neural text-to-speech (the same voices as
  Edge's Read Aloud) via the keyless `msedge-tts` package — 16 voices across
  all supported languages.
- **Avatar**: free DiceBear illustrated avatars (fetched at render time; if
  unreachable, the render proceeds with just the background + voice).
- **Compositing**: `ffmpeg` — background color + centered avatar + audio
  track at the chosen aspect ratio.

Requirements: `ffmpeg` on the machine (`sudo apt install ffmpeg` /
`brew install ffmpeg`; or set `FFMPEG_PATH`). Rendered files land in
`.local-renders/` (override with `LOCAL_RENDER_DIR`) and are served,
auth-gated, from `/api/local-video/:id`.

Notes: Edge TTS is an unofficial endpoint — fine for personal use, but for
commercial scale switch to a paid TTS or HeyGen. The result is a static
presenter (no lip-sync); for true talking-head animation use HeyGen or
self-hosted Duix-Avatar.

### Self-hosted option: Duix-Avatar (experimental)

[Duix-Avatar](https://github.com/duixcom/Duix-Avatar) is an open-source,
Docker-deployed digital-human stack (NVIDIA GPU required) — appearance/voice
models are trained locally, so there is no cloud catalog. To try it:

```bash
VIDEO_PROVIDER=duix
DUIX_VIDEO_API_URL=http://127.0.0.1:8383     # /easy/submit + /easy/query
DUIX_TTS_API_URL=http://127.0.0.1:18180      # /v1/invoke
DUIX_AVATARS='[{"id":"<model-video-path>","name":"My Avatar"}]'
DUIX_VOICES='[{"id":"<speaker-uuid>","name":"My Voice","language":"English"}]'
```

Duix deployments vary by version — verify the request/response fields in
`duix.ts` against your instance before relying on it.

### Related projects reviewed during development

- [fracabu/heygen-app](https://github.com/fracabu/heygen-app) — Python HeyGen
  API scripts; used to cross-check endpoint usage and credit behavior.
- [heygen-com/skills](https://github.com/heygen-com/skills) — HeyGen's agent
  skills; confirms the `HEYGEN_API_KEY` convention this app follows.
- [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) —
  deterministic HTML→MP4 rendering. Not an avatar API; a good future
  post-processing layer (captions, intros/outros, compositions) on top of
  avatar clips from this app.
- [duixcom/Duix-Avatar](https://github.com/duixcom/Duix-Avatar) — basis for
  the experimental self-hosted provider above.

---

## Data model

`projects` stores exactly what the product needs to re-render and audit:

`id · user_id · title · script · avatar_id · avatar_name · voice_id ·
voice_name · language · aspect_ratio · background_color · status
(pending/processing/completed/failed) · provider · provider_video_id ·
final_video_url · thumbnail_url · error_message · created_at · updated_at`

Row-level security restricts every operation to the owning user. `profiles`
carries `plan`, `stripe_customer_id`, `stripe_subscription_id`, and
`subscription_status` so Stripe can be wired in without a migration.

## Render lifecycle

1. `POST /api/videos` — validates with zod, runs the moderation gate,
   calls `provider.createVideo()`, inserts the project (`pending`).
2. The project page mounts `VideoStatusPoller`, which hits
   `GET /api/videos/:id/status` every 5 s.
3. The status route asks the provider, persists any transition, and stops
   round-tripping once the project is terminal.
4. On `completed`, the page shows the MP4 with a download button.

> Note: HeyGen video URLs expire after a period. For permanent hosting, copy
> finished MP4s into the `videos` Supabase storage bucket (already created by
> the schema) — a good first production hardening task.

## Safety & responsible use

- **Consent gate**: generation requires explicitly confirming you have rights
  and consent for the avatar/voice/content (checked in the UI *and* enforced
  server-side by schema validation).
- **Impersonation blocked**: `lib/moderation.ts` rejects scripts containing
  impersonation language before any provider call.
- **Moderation placeholder**: the gate is intentionally pluggable — swap in a
  real moderation API before scaling.

## Lip-sync pipeline

Beyond static-presenter renders, AvatarStudio has a provider-based lip-sync
layer (`lib/lipsync/`) that animates a face to match the generated voice:

1. On the create page, pick a **Lip Sync Engine** (Auto / HeyGen / Replicate /
   fal MuseTalk / Mock), optionally toggle **"Use source video instead of
   still avatar"**, and upload a face image or talking-head clip (stored in
   the Supabase `videos` bucket).
2. Generation first ensures speech audio exists — synthesized with the free
   Edge TTS from your script and stored publicly so providers can fetch it —
   then `POST /api/lipsync/create` starts the provider job.
3. The project page polls `GET /api/lipsync/status/:projectId` until the
   lip-synced MP4 is ready; the URL is saved to the project
   (`lipsynced_video_url`) and shown with preview + download.

| Engine | Needs | Face source |
| --- | --- | --- |
| HeyGen | `HEYGEN_API_KEY` | Uploaded photo (talking photo) or stock avatar |
| Replicate | `REPLICATE_API_TOKEN` + `REPLICATE_LIPSYNC_VERSION` (a Wav2Lip-style model version hash) | Image or video |
| fal MuseTalk | `FAL_KEY` | Source video only |
| Mock | nothing | any (simulated) |

"Auto" picks the first configured engine in that order, falling back to the
mock engine so the whole flow is testable with zero keys. A dedicated
consent checkbox — *"I have permission to use this person's image, voice,
and likeness."* — is required (client- and server-enforced) before any
lip-sync generation.

If you added lip-sync to an existing database, re-run `supabase/schema.sql`
— the new project columns are added idempotently.

## Offline dashboard (PWA)

AvatarStudio is an installable Progressive Web App, and the dashboard stays
manageable without a connection:

- **Service worker** (`public/sw.js`): app shell + visited pages are cached
  (network-first), static assets cache-first, with an `/offline` fallback.
  API responses are never cached.
- **Local project mirror**: the dashboard mirrors your project list into
  IndexedDB (`lib/offline/projects-cache.ts`). Offline, it renders the
  mirrored copy with a "locally saved" notice.
- **Offline drafts** (`lib/offline/drafts.ts`): write scripts and configure
  videos with no connection — "Save draft (works offline)" stores them on
  the device; they appear in a Drafts section on the dashboard and can be
  resumed via `/create?draft=<id>`. Generating a video (which needs the
  server) deletes the local draft.
- **Install it**: in Chrome/Edge use "Install app" from the address bar;
  it launches standalone straight into the dashboard
  (`public/manifest.webmanifest`).

## Roadmap

- Stripe Checkout + webhooks (structure already in place)
- Copy finished renders into Supabase storage for permanent URLs
- Webhook-based render callbacks instead of polling (HeyGen supports this)
- Composition/captions via an HTML→video layer such as hyperframes
