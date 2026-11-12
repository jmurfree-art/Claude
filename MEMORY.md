# MEMORY.md

Durable context about this account, assembled from state Claude can enumerate:
repositories, pull requests, Claude Code sessions, published artifacts,
scheduled tasks, enabled skills, and installed connectors.

Format: one entry per line, `[YYYY-MM-DD] - entry`, oldest first within each
section. `[unknown]` where no date is available. Entries marked **(inferred)**
are deductions, not stated facts — correct them.

Assembled 2026-11-12, then extended with practice facts from the
`dental-content` skill once PR #3 merged and made it readable. Additive by
design: this file records facts and does not issue instructions. Standing
instructions are in `CLAUDE.md`.

> **This repository is public.** Anything committed here is world-readable. No
> credentials, health data, financial figures, account numbers, addresses, or
> personal phone numbers. See Hygiene at the bottom for what was withheld.

## Instructions

Standing instructions are **not** maintained in this file. The authoritative set
is the `CLAUDE.md` and `HANDOVER.md` pair at the repository root, merged to
`main` on 2026-11-12 via PR #3. Claude Code loads `CLAUDE.md` every session.

Its handles, for reference: the receipt test · load-bearing uncertainty · cheap
information first · gather → decide → destroy · *fluency proposes, verification
disposes* · reality outranks memory · the fabrication gradient · the two-fates
rule (verified or visibly softened) · reproduce before fixing · four registers
kept separate (observation / inference / recommendation / bounds) · brevity is
selection · bad news first · five ordered self-review passes · ten named failure
modes. Core thesis: effort belongs at the joints — understanding the ask,
checking the work, reviewing before shipping.

- [unknown] - Keep business-sensitive output (competitor and SEO research,
  financials) out of the public repositories; deliver it through Notion instead.
  Stated in the PR #3 description and treated as settled practice.

## Preferences

Observed working style, mostly from stored scheduled-task prompts written for
autonomous runs. Confirm before treating as rules.

- [unknown] - Honesty over completeness — never fabricate a pass. Self-check
  harnesses report `BLOCKED` rather than inventing a result.
- [unknown] - Report figures only from an actual data pull; never estimate them.
- [unknown] - Prefer Bash-first tooling in autonomous runs; avoid tools that may
  hang on a permission prompt.
- [unknown] - Treat git as the guaranteed report channel: finish by committing
  and pushing a status file even on total failure.
- [unknown] - Never force-push; never push outside the branch assigned.
- [unknown] - Delegate mechanical steps to cheaper models, reserving the
  expensive model for review and the final write.
- [unknown] - Ships work as draft PRs rather than merging to `main`.

## Identity

- [unknown] - GitHub account `jmurfree-art`; owns both repositories in use.
- [unknown] - Hugging Face account `juanmurf`.
- [unknown] - Based in Murfreesboro, Tennessee (Rutherford County, Middle
  Tennessee). Works in US Central Time — confirmed by the location, not just by
  the "Mon 7am CT" scheduled task it was first guessed from.
- [unknown] - The practice's dentist is **Dr. John Murfree, DDS**, recorded as a
  verified practice fact in `.claude/skills/dental-content/SKILL.md`. The
  `jmurfree-art` and `juanmurf` handles are consistent with this being the
  account owner, but no repository content states that outright.
  **(inferred** identification.**)**
- [unknown] - Has a Windows machine running ComfyUI locally, used for generative
  media work, and reaches Claude from desktop, web, and iOS.

## Career

- [unknown] - Works on **Murfree Dental** — a family-based general and cosmetic
  dental practice at 1140 Dow St, Murfreesboro, TN 37130, (615) 893-1770,
  murfreedental.com. Positioning: "a family-based office dedicated to providing
  high-quality dental care in a friendly, comfortable environment." Work spans
  content writing, local SEO, patient-education and marketing video, and
  practice finances.
- [unknown] - The practice's differentiators, as encoded for content work:
  implant credentials (IDIA Fellowship, Master's, Diplomate), laser dentistry,
  cone beam 3D imaging, platelet-rich fibrin, oral conscious sedation, and a
  hometown doctor born and raised in Murfreesboro. Services are organized as
  cosmetic, restorative, general, sedation, emergency, and dental technology,
  with site links following `/services/<category>/<service>/`.
- [unknown] - Local SEO targets, in order: Murfreesboro TN, then Rutherford
  County, then Middle Tennessee.
- [unknown] - Buys and reconciles Meta/Facebook advertising.
- [unknown] - Skill areas evident from the work: full-stack web development
  (Next.js 14/15, React, TypeScript strict, Tailwind, Supabase with row-level
  security, pnpm), generative media pipelines (ComfyUI, Higgsfield, lip-sync and
  avatar engines), local-search auditing, and small-business finance ops.

## Projects

- [2026-07-03] - **AvatarStudio** — AI avatar video generator; script in, presenter-led MP4 out. Next.js 15, React 19, Supabase, with a provider abstraction (a free local ffmpeg + neural-TTS path by default, plus HeyGen, Replicate, fal MuseTalk) and a modular open-source avatar-engine layer (LatentSync, EchoMimic, MuseTalk, LivePortrait, VideoReTalking) behind one interface. Offline-capable PWA dashboard; likeness-consent and moderation gates enforced on both sides. Branch `claude/avatar-video-generator-h2e8gy`, draft PR #1, unmerged.
- [2026-07-07] - **WatchDeck** — a YouTube-lite web app: `yt-dlp` search with no API key, watchlists, an upload/create/edit pipeline, public video pages, and a pure-TypeScript extractive summarizer. Next.js 14, Supabase with RLS, pnpm. Branch `claude/watchdeck-youtube-app-l1nigq`, draft PR #2, unmerged. **Blocked** — live Supabase provisioning fails because the cloud environment blocks egress to `api.supabase.com`; Supabase- and YouTube-dependent self-checks report BLOCKED rather than passing. A fire-only scheduled task exists to retry setup.
- [2026-07-08] - **Way-of-thinking handover** — `HANDOVER.md` (long-form) and `CLAUDE.md` (its operational form) encoding a discrimination-over-generation methodology, plus repo skills `/dental-content` and `/practice-video` and a set of vendored frontend/accessibility UI skills with a `skills-lock.json`. **Merged to `main` 2026-11-12 via PR #3** and now the authoritative standing-instructions source, loaded every session.
- [2026-07-08] - **ComfyUI Invisalign ad** — a scripted ad pipeline (`run_ad.py`, `shots.json`, `endcard.py`) under `comfyui-invisalign-ad/`, tied to local ComfyUI work. On `main` since 2026-11-12.
- [2026-07-17] - **Datadump** — second public repo, `jmurfree-art/Datadump`, used as a drop point for files to hand to sessions. Last pushed 2026-07-17.
- [2026-08-11] - **Brand asset pack via Higgsfield** — completed in a remote-control session.
- [2026-08-17] - **Meta ad spend statement** — an itemized expense statement compiled from a bank export, as a self-contained HTML page. Branch `claude/facebook-charges-invoice-1yls6e`, draft PR #4, unmerged. Contains bank-derived financial detail; see Hygiene.
- [2026-11-02] - **Murfree Dental search audit** — three artifacts: Search Audit, Rollout Plan, and Audit Verification Record. The most recent substantial work on the account.
- [2026-11-12] - **Repo memory persistence** — this file. Branch `claude/vigilant-turing-rmcceu`, draft PR #5.

### Murfree Command Center

- [2026-07-04] - A Notion operations hub, page `f90adc14-5860-8215-8500-8184cb22aa93`. A scheduled task posts a dated entry every Monday under its "📊 WEEKLY REPORT" section: production vs. goal, P&L snapshot, A/R aging buckets, gaps and opportunities, and one recommended action, pulled from QuickBooks and written into Notion newest-first. **Currently degraded** — the Intuit QuickBooks connector is not connected, so the task takes its auth-failure branch and posts a "paused pending re-authorization" notice instead of real numbers. The cron is `0 12 * * 1` UTC, which is 7:00 AM CT only during daylight saving; in standard time it fires at 6:00 AM CT.

## Conversations

Claude Code sessions, oldest first, with status as of assembly.

- [2026-07-03] - "AI avatar video generator app" — review-ready; became PR #1.
- [2026-07-03] - "GitHub repository access" — review-ready.
- [2026-07-04] - "Initial review prompt" — blocked; wanted `00_INITIAL_REVIEW_PROMPT.txt` pasted or pushed to Datadump.
- [2026-07-04] - "Murfree Command Center" — archived, completed.
- [2026-07-07] - "WatchDeck YouTube-lite web app" — blocked; wanted a PowerShell restore block run locally, then `git pull` and setup re-run.
- [2026-07-08] - "New session" — the persistent session the weekly Monday report fires into, and the origin of PR #3. Last fired 2026-11-09.
- [2026-07-16] - "CLAUDE.md documentation" — review-ready, from iOS.
- [2026-07-17] - "CLAUDE.md documentation" — review-ready, from iOS.
- [2026-07-22] - "Chrome connection" — blocked; wanted the Chrome extension installed and `claude --chrome` run locally.
- [2026-08-10] - "Search old chats and update memory" — archived, completed. An earlier run at this same memory goal.
- [2026-08-10] - "Build complete brand asset pack with Higgsfield" — archived, completed.
- [2026-08-11] - "ComfyUI assets inventory" — blocked; wanted a PowerShell listing pasted.
- [2026-08-13] - "Zapier MCP onboarding" — blocked on "Want me to save this as a skill on your Zapier MCP?"
- [2026-08-17] - "Facebook charges invoice" — failed; became PR #4.
- [2026-11-12] - "Memory and context export" — this session.

- [2026-11-12] - Pattern: most stalled sessions are blocked on a step needing the
  local Windows machine (PowerShell listings, a Chrome extension, a restore
  script). Cloud sessions cannot reach it unless a folder is shared through
  Remote Control.
- [2026-11-12] - Pattern: three separate sessions have now attempted a
  CLAUDE.md or memory-persistence task, and all the resulting work is still
  unmerged.

## Skills

Enabled on the claude.ai account (18):

- [unknown] - Documents and files: `docs`, `docx`, `pdf`, `pptx`, `xlsx`, `google-workspace`.
- [unknown] - Design and artifacts: `canvas-design`, `theme-factory`, `web-artifacts-builder`.
- [unknown] - Building for Claude: `skill-creator`, `mcp-builder`, `import-memory`.
- [unknown] - Browser and desktop control: `chrome-browser`, `built-in-browser`, `computer-use`.
- [unknown] - Research and learning: `deep-research`, `learn`.
- [unknown] - Routine: `morning`.

Authored in this repository, on `main` since 2026-11-12:

- [2026-07-08] - `/dental-content` — on-brand Murfree Dental writing: verified vs. confirm-first practice facts, services taxonomy and URL patterns, voice rules, local-SEO defaults, per-content-type recipes, compliance guardrails. Unverifiable facts carry `[CONFIRM: …]` markers.
- [2026-07-08] - `/practice-video` — patient-education and marketing video via the Higgsfield explainer workflow, with a Murfree brand layer, credit hygiene, consent gates, and a 60-second Invisalign example script.
- [2026-11-12] - `/ad-engine` — paid-ad creative as a scored batch (not yet on
  `main`; on branch `claude/intelligent-gauss-8n2iyz`). Carries an environment
  audit (this account has tools and composition, but no ads data and no publish
  access), the hard rules for synthetic people in dental advertising, a
  concepts-before-pixels static workflow, the three-input lock for video models,
  a pre-human scoring rubric, and parameter-level provenance. Source notes for
  the techniques live in `references/source-masterclass.md` beside it.
- [2026-07-08] - Vendored UI skills: `baseline-ui`, `frontend-design`, `fixing-accessibility`, `fixing-metadata`, `fixing-motion-performance`, pinned by `skills-lock.json` and mirrored under `.agents/skills/`.

- [2026-11-12] - No plugins are enabled at the claude.ai account level. Plugin
  skills that appear inside a session (`design`, `small-business`,
  `cowork-plugin-management`) come from that session's environment, not the
  account, so they are not guaranteed next time.

## Connectors

- [2026-11-12] - Connected and usable: Canva, Figma, Google Drive, Higgsfield, Hugging Face, Notion.
- [2026-11-12] - Zapier — connected at account level, tools not loaded in sessions.
- [2026-11-12] - Needs reconnection: Base44.
- [2026-11-12] - Installed but never connected: Gmail, Google Calendar, GoDaddy, HubSpot, Intuit QuickBooks.
- [2026-11-12] - QuickBooks being unconnected is what degrades the weekly Murfree
  Command Center report. Reconnect at claude.ai → Settings → Connectors.

## Open work

- [2026-11-12] - PR #3 is merged; `main` now carries the working methodology,
  the repo skills, and the ComfyUI ad pipeline. Three drafts remain stranded on
  branches: #1 AvatarStudio, #2 WatchDeck, #4 Meta ad statement. #5 adds this
  file. Both #1 and #2 are substantial app builds whose branches predate the
  merged `CLAUDE.md`, so a session resuming either should re-read it first.

## Hygiene

Deliberately kept out of this file because the repository is public:

- [2026-11-12] - The account email address; held in session only.
- [2026-11-12] - One installed connector, omitted from the Connectors list
  because it concerns health data.
- [2026-11-12] - All financial figures. PR #4 carries bank-derived charge data
  in both the file and the PR description; consider whether that belongs in a
  public repository before merging.
- [2026-11-12] - A live API token found embedded in the stored prompt of the
  WatchDeck setup scheduled task. It is recorded nowhere in this repository. It
  needs rotating at its provider and removing from that prompt.
- [2026-11-12] - Compiled `__pycache__/*.pyc` files are now on `main` under
  `comfyui-invisalign-ad/`, carried in by the PR #3 merge. They want a
  `.gitignore` entry and a `git rm --cached` to clear out.
