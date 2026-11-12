# Invisalign at Murfree Dental — 60-second explainer (6 blocks)

Status: script + prompts ready. Needs before generation: user-picked style preset, narrator voice, and confirmation of the treatment-length line in Block 5.

## Style descriptor (Phase 1, adapt to chosen preset)

Clean modern flat 2D illustration, soft teal and warm coral palette, rounded friendly shapes, gentle gradients, calming healthcare-adjacent warmth, consistent line weight, non-photorealistic, no live-action, no realism.

## Narration (Phase 2 — each block ~20–24 words, spoken ~8–9s)

```
Block 1
Thinking about a straighter smile without metal braces? Invisalign uses clear, removable aligners that fit your life — nearly invisible, and comfortable.

Block 2
Here's how it works: Dr. Murfree maps your smile with advanced three-D imaging, then designs your own personalized series of aligners.

Block 3
You'll wear each set for about two weeks, moving to the next as your teeth shift — gradually, gently, on your schedule.

Block 4
The aligners come out for meals and brushing, so you keep enjoying the foods you love and caring for your teeth as always.

Block 5
Many patients finish in about twelve to eighteen months, with quick, friendly check-ins along the way to keep everything on track.

Block 6
Ready to see what Invisalign could do for your smile? Schedule a consultation with Murfree Dental in Murfreesboro — visit murfree dental dot com.
```

[CONFIRM before voicing: Block 5 treatment-length range with Dr. Murfree.]

## Block prompts (Phase 3 — {STYLE} = tokens from the chosen preset/key)

```
Block 1
STYLE REFERENCE: Match the attached style key EXACTLY — {STYLE}.
SCENE: A relaxed adult smiles and holds up a clear dental aligner, soft abstract dental-studio backdrop with plants and warm light.
MOTION: Slow gentle push-in toward the aligner catching the light.
AUDIO: Soft optimistic ambient music, faint room tone.
NEGATIVE: color drift, photorealism, 3D render, live-action, lip-sync, captions, on-screen text, watermark, blood, needles, drills-in-mouth.

Block 2
STYLE REFERENCE: Match the attached style key EXACTLY — {STYLE}.
SCENE: A stylized scanning grid of light sweeps across an illustrated smile, which transforms into a neat row of custom aligner trays.
MOTION: Smooth orbital pan around the smile as the scan completes.
AUDIO: Gentle futuristic shimmer over the ambient music bed.
NEGATIVE: color drift, photorealism, 3D render, live-action, lip-sync, captions, on-screen text, watermark, blood, needles, drills-in-mouth.

Block 3
STYLE REFERENCE: Match the attached style key EXACTLY — {STYLE}.
SCENE: A sequence of aligner trays advances one by one beside a flipping wall calendar while illustrated teeth ease into alignment.
MOTION: Steady lateral glide following the advancing trays.
AUDIO: Soft ticking-page rhythm blended into the music.
NEGATIVE: color drift, photorealism, 3D render, live-action, lip-sync, captions, on-screen text, watermark, blood, needles, drills-in-mouth.

Block 4
STYLE REFERENCE: Match the attached style key EXACTLY — {STYLE}.
SCENE: Two cozy vignettes drift past — friends sharing a meal at a bright table, then a person brushing at a sunny sink, aligner case nearby.
MOTION: Gentle drifting crossfade between the two vignettes.
AUDIO: Warm cafe murmur fading into soft running water.
NEGATIVE: color drift, photorealism, 3D render, live-action, lip-sync, captions, on-screen text, watermark, blood, needles, drills-in-mouth.

Block 5
STYLE REFERENCE: Match the attached style key EXACTLY — {STYLE}.
SCENE: A flowing timeline ribbon with friendly milestone checkmarks; a welcoming illustrated clinician waves beside the final milestone.
MOTION: Forward dolly gliding along the ribbon toward the last checkmark.
AUDIO: Uplifting rising motif over the ambient bed.
NEGATIVE: color drift, photorealism, 3D render, live-action, lip-sync, captions, on-screen text, watermark, blood, needles, drills-in-mouth.

Block 6
STYLE REFERENCE: Match the attached style key EXACTLY — {STYLE}.
SCENE: A radiant confident smile blooms center-frame in warm sunrise tones, soft rays and rounded sparkles filling the frame.
MOTION: Slow blooming zoom-out with a gentle settle.
AUDIO: Music resolves to a warm, hopeful final chord.
NEGATIVE: color drift, photorealism, 3D render, live-action, lip-sync, captions, on-screen text, watermark, blood, needles, drills-in-mouth.
```

## Generation checklist (from the video-explainer workflow)

1. Style: preset via `resolve_explainer_preset` (free) or `generate_image` key (`nano_banana_pro`, 16:9) → keep job/media id.
2. Clips: 6 × `generate_video` (`gemini_omni`, duration 10, 720p, style key in `medias`) → poll `job_status`.
3. Voice: `list_voices` → USER picks → 6 × `generate_audio` (`seed_audio`, same voice_id/type) → poll.
4. Assemble: `explainer_video` (1280×720, items = [{video, audio}] × 6, in order) → poll → deliver MP4.
