---
name: ad-engine
description: >-
  Produce paid-ad creative for Murfree Dental as a batch: research the
  angle, write the concepts, generate or compose the creative, score it
  against a rubric before a human sees it, and hand back an upload-ready
  package. Use for: "make some ads", "static ads for Invisalign", "ad
  creative", "Facebook/Meta ad variations", "ad angles", "test some
  creative", "UGC-style ad", "ad copy batch". For a single explainer or
  patient-education video use /practice-video; for page, blog, email or
  social copy use /dental-content.
---

# Murfree Dental Ad Engine

The job this skill does: turn "we need ads" into a numbered batch of compliant,
scored ad creative plus the sheet needed to upload it — produced by one agent
run instead of a designer, a copywriter and a media buyer.

The frame it works from (source: `references/source-masterclass.md`): ad
production that used to be labor is now **code and tokens**, so the operator's
job is not to be the designer — it is to build the environment the agent needs
and then run a discriminator over what comes out. Four pillars make that
environment: **data** (what performs), **access** (publish rights), **tools**
(models and composition), **swipe** (examples of good). Read the audit below
before promising any of it, because this account has two of the four.

## Environment audit — what this account actually has

*Observation, as of 2026-11-12. Re-check before relying on it.*

| Pillar | State here | Consequence for the run |
|---|---|---|
| **Data** | No pipeline, no warehouse. HubSpot, QuickBooks, Gmail, Google Calendar installed but unconnected. No Meta/Google Ads read access. | There is **no performance feedback loop**. Never claim an angle "works" or report a metric. Creative decisions here are reasoned, not measured, and must be labelled that way. |
| **Access** | No Meta Marketing API token, no Google Ads token, no ads connector loaded in sessions. Zapier is connected at the account level but its tools have not appeared in a session, so treat it as a maybe to test, not a capability to promise. | **Claude cannot publish.** The deliverable stops at files plus an upload sheet. The user uploads. Say so in the handoff every time. |
| **Tools** | Higgsfield (images/video, costs credits), Canva (layout, brand templates), Figma, vidIQ (hook/title research), Google Drive, Notion. | Composition of text-on-image belongs in Canva; generated imagery in Higgsfield; research in vidIQ plus the live web. |
| **Swipe** | Nothing collected yet. | Build it, in **Notion or Drive — not this public repository** (standing instruction: competitor and SEO research stays out of public repos). One page per saved ad: screenshot, source, why it works, angle label. |

Sandbox facts, verified this session: `ffmpeg` and `ffprobe` are present at
`/usr/bin`, but outbound media downloads are refused at the proxy (403 on the
CONNECT tunnel). So local video post-processing is **not** runnable here for
lack of the file, not for lack of the tool. Anything that needs a rendered asset
in hand happens in Higgsfield's own tools or in the user's CapCut/DaVinci.

## Hard rules — these override the source playbook

1. **No synthetic person may portray a patient, a staff member, or Dr. Murfree.**
   An AI avatar is allowed only as an unnamed presenter reading educational
   copy. A generated face saying "I got my implants here" is a fabricated
   endorsement — an FTC and dental-advertising problem, and a brand risk that
   the cheap-creative arithmetic does not cover. The source playbook's flagship
   move (avatars that "look real, talk real") is adopted **only** in this
   narrowed form.
2. **No before/after that is not the practice's own case photo**, with written
   patient consent, unretouched. Never generate, enhance or imply a result.
3. **`/dental-content` compliance applies to ad copy verbatim**: no "painless",
   "best", "guaranteed", "permanent"; no PHI; Invisalign® with ® on first use;
   no price, offer or hours that the user did not state — use `[CONFIRM: …]`.
4. **No competitor named** in ad copy or visuals.
5. **Human gate before anything goes live.** The user approves copy and creative
   and performs the upload. Claude never publishes, schedules or spends ad
   budget.
6. **Credit preflight.** Call `balance`, price the batch, state the total, get a
   yes before generating. Text and research phases are free; generation is not.
7. **Teeth are the failure mode.** Image models mangle teeth, gums and hands.
   Inspect every tooth in every candidate at full size. A six-tooth smile kills
   the ad and the credibility of the practice running it.

## Workflow A — static ad batch

1. **Skip brand extraction.** The source workflow scrapes the brand's site for
   fonts, colors and voice. Here `/dental-content` *is* the brand of record —
   load it and use it. Do not re-derive the brand from the website.
2. **Pick the angle set.** Dental angles that exist, each a distinct promise:
   anxiety and comfort · cost ambiguity and financing · time (fewer visits,
   same-day) · appearance and confidence · credentials and hometown trust ·
   what a visit is actually like · urgency (pain, emergency, broken tooth).
   One ad = one angle = one idea. Confirm the service and the angle set with the
   user if they named neither.
3. **Research the ask, don't invent it.** Pull the practice's own review themes,
   the questions real people ask (search, Reddit, forums) about that service in
   this price range, and hook phrasing via vidIQ. Record where each pain point
   came from; an angle with no source behind it is a guess and gets labelled as
   one.
4. **Write concepts before pixels.** Per variant: angle label · headline (≤7
   words) · primary text (≤125 chars) · visual direction (one sentence) · CTA ·
   destination URL with UTM. Ten concepts cost nothing; ten renders cost money.
   Get the concept list approved first on any batch above about five.
5. **Gate** (Workflow C) — before the user sees anything.
6. **Compose.** Text-on-image in Canva against a brand template, because
   generated type is unreliable and un-editable. Use Higgsfield only for the
   underlying imagery, and prefer a real photo of the real office over a
   generated interior that is nobody's office.
7. **Package** (see Deliverables).

**On cohort size.** The source's lesson is creative velocity — ship 30, not 10
a month, because the ad platform finds the buyer if you feed it variety. Keep
the *reasoning*, not the number: every variant must get enough spend to leave
the learning phase, so a single-location practice ships 5–8 variants per test,
not 30. Tell the user the constraint is their budget divided by variants, and
that this is reasoning, not a measured result from their account.

## Workflow B — presenter video ad

`/practice-video` owns video generation, Higgsfield credits and the Murfree
visual defaults. Load it. This skill contributes three techniques on top:

- **The three-input lock.** Never hand a video model a bare script. Send the
  exact script **and** a voice take (MP3) **and** a reference image together, so
  the model cannot invent the words or the face. This is the single most useful
  mechanic in the source material: it converts an open-ended generation into a
  constrained one.
- **Transcript-versus-script diff as an acceptance test.** Get word-level
  transcription of the render, diff it against the script, and treat any
  mismatch as a defect with a timestamp — then patch that span rather than
  re-rendering the whole clip. This is how a mispronounced name gets fixed for
  cents. (Diffing is free; the patch render is not.)
- **Cheap render, then upscale.** Generate at low resolution, accept or reject,
  and only upscale what survives. Note the sandbox bound above: the upscale and
  any ffmpeg work happen in Higgsfield or on the user's machine, not here.

**Standing recommendation:** for this practice, real footage of the real doctor
in the real office beats a synthetic presenter every time — the practice already
has professional footage in Drive. Reach for an avatar only when the shot cannot
be filmed, and then only within Hard Rule 1.

## Workflow C — the creative-director gate

The highest-value import from the source, and the step that will feel skippable.
**Generation and judgment are separate passes.** Score every candidate before a
human sees it; revise; re-score; at most three loops; only candidates at 8/10 or
better reach the user, and anything that cannot get there gets reported as
rejected with the reason.

Score each of these 0 or 1, then judge the whole:

- Hook lands in the first three words (static) or first second (video).
- Exactly one idea. A second idea is a second ad.
- Every claim compliant and softened; nothing guaranteed, nothing superlative.
- CTA present, and the destination actually serves it.
- Brand legible: practice name readable at 320px wide, logo not cropped.
- Image text sparse enough to read on a phone at a glance.
- No uncanny artifacts — **teeth, gums, hands, eyes, ear jewelry**, text in the
  background.
- No invented number, price, date, credential or statistic.
- Nothing that implies a result, a patient or an endorsement.

This is `CLAUDE.md` §3 applied to pixels: fluency proposes, verification
disposes. The run that produced the creative is the worst possible judge of it,
so make the scoring pass read the rubric and the artifact — not its own memory
of what it intended.

## Provenance — log the parameters, not just the file

The sleeper technique in the source: store the **generation request** beside the
output — model, full prompt, seed, reference images, cost — keyed to an ad ID
that matches what gets uploaded. Without it you learn which *file* won and never
which *parameter* won, which is the only thing that compounds.

Naming: `MD-<yyyymmdd>-<service>-<angle>-v<N>`. Log lives in Notion or Drive,
never in this public repository.

## Deliverables — definition of done

1. Numbered creative batch, files named per the convention.
2. **Upload sheet** (one row per variant): ad ID · campaign · ad set · primary
   text · headline · description · destination URL + UTM · creative filename ·
   angle.
3. **Angle and parameter log** for provenance.
4. Rubric scores, including what was rejected and why.
5. Credits actually spent.
6. The explicit line: **not published — Claude has no ads access; you upload.**
7. Bounds: which claims were researched versus reasoned, and what was not
   checked.
