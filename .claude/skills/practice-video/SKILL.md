---
name: practice-video
description: >-
  Create narrated, animated patient-education and marketing videos for
  Murfree Dental using the Higgsfield MCP video-explainer workflow.
  Use for: "make a video about <service>", "Invisalign/implants explainer",
  "video for the website/social", "patient education video", "practice
  video". Produces a finished MP4 (N x 10-second blocks, one narrator,
  consistent animated style).
---

# Murfree Dental Practice Video Skill

Turn "make a video about X" into a finished, on-brand animated explainer via the Higgsfield MCP server. This skill is the practice-specific layer; the generic pipeline is authoritative and MUST be loaded fresh each run:

1. Call `get_workflow_instructions` with `{workflow: "video-explainer"}` (Higgsfield MCP) and follow its phases exactly.
2. Apply the Murfree overrides below wherever the two differ in emphasis.

## Footage-first (read before generating anything)

**Real practice footage beats AI-generated clips, and it's free.** The practice has professional video in Google Drive (office tour, services reel, brand video, procedure animations) plus more via `vimeo_urls.txt`. Generic AI clips of invented patients look stock no matter the budget; real office + real Dr. Murfree does not. **Default to editing existing footage; treat AI generation as a paid last resort for shots that can't be filmed.**

- **AI video is NOT free on the Plus plan.** Each 10s clip ≈ 30 credits (a 30s video ran 93 credits). The "unlimited" Higgsfield offers are an Ultra-plan upsell, mostly still-image models. Never imply free/unlimited video exists on Plus.
- **This Claude Code sandbox cannot render video** — no ffmpeg (can't install), large private Drive files can't be pulled in, outbound media downloads are blocked. So local editing is out. Use one of:
  - **Free, user-run:** hand the user a timecoded edit guide for CapCut/DaVinci Resolve (both free, import Drive directly).
  - **Free, Claude-run:** if the user uploads their clips into their Higgsfield library, assemble with the `explainer_video` tool — **assembly costs 0 credits** (only generation costs). Lay existing/free voiceover over it.
- Don't invent source timecodes for footage you can't watch — give structure and let the editor pick shots.

## If generating AI clips anyway (paid path)

- Call `balance` first. Text phases are free; the style key, each 10s clip (~30 cr), and each voice take (~1 cr) cost credits. Always `get_cost`-preflight and tell the user the total before spending.
- Prefer **image-to-video from a real frame** of their footage over inventing scenes from text, so it's their actual office animated.
- The three choices that belong to the USER (never auto-pick unless they say "you choose"): visual style, narrator voice (from `list_voices`), duration/aspect/subtitles.

## Murfree defaults (offer these as recommendations, user confirms)

- **Length:** 1 minute (6 blocks) for a single service; 30s (3 blocks) for social teasers.
- **Aspect:** 16:9 for website/YouTube; 9:16 only when the user says social/Reels.
- **Character:** faceless (stylized scenes). No mascot unless asked.
- **Style direction:** clean, warm, modern flat 2D — calming palette (soft blues/teals + warm accent), rounded shapes, light medical-but-friendly. Never clinical-scary: no drills-in-action, no blood, no photoreal open mouths.
- **Voice:** warm, reassuring, mid-tempo. User picks the specific voice from `list_voices` every time.

## Script rules (Murfree layer on Phase 2)

- Voice and compliance come from the `/dental-content` skill: comfort-first, technology → comfort → outcome, no outcome guarantees ("designed to," "many patients"), no superlatives, no PHI, no invented numbers or prices.
- Clinical claims stay general and softened ("most treatments," "about"); anything specific (treatment length, pricing, offers) gets confirmed with the user BEFORE voicing — a voiced fabrication is expensive to fix.
- Each block ~20–24 words (~8–9s spoken), numbers spelled out, no stage directions.
- Last block is always the CTA: practice name + Murfreesboro + "visit murfree dental dot com" (spoken; clips must stay text-free, so the CTA is voice-only).
- Educational framing: attribute recommendations to the practice ("Dr. Murfree may recommend…"), never diagnose the viewer.

## Scene rules (Murfree layer on Phase 3)

- Scenes show benefit and calm, not procedure gore: smiling patients, abstract 3D-imaging visuals, aligner/implant illustrations, office-warmth vignettes.
- NEGATIVE line always includes: photorealism, 3D render, live-action, on-screen text, captions, watermark, blood, needles, drills-in-mouth.
- Keep one consistent patient-figure style across blocks; diverse, friendly, non-clinical.

## Delivery

- Assemble automatically (the workflow's Phase 6) — never hand the user loose clips.
- Present the final MP4 URL, then offer: 9:16 recut (via `reframe`), a version for another service, or subtitles.
- Log what was made and its topic in the session summary so the user can find it in Higgsfield (`show_generations`).

## Ready-to-run example

`examples/invisalign-60s.md` in this skill folder holds a complete pre-drafted 60-second Invisalign script (6 narration blocks + 6 block prompts + style descriptor) that passed the compliance rules. For a first run, use it as-is after the user picks style + voice; for other services, use it as the structural template.
