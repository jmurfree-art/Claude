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

## Before spending anything

- Call `balance` first. Rough shape: text phases are free; the style key, each 10s clip, and each voice take cost credits (subtitles +0.05/block). A 1-minute video = 1 key + 6 clips + 6 voice takes. If balance looks low relative to recent transactions, tell the user the estimate and get a go-ahead.
- The three choices that belong to the USER (hard rule, never auto-pick unless they say "you choose"): visual style (show the preset gallery / offer options), narrator voice (from `list_voices`), and duration/aspect/subtitles.

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
