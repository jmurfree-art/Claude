# Source notes: "marketing engineer" masterclass

**Provenance.** Notes taken from the transcript of a YouTube interview —
Cody Schneider on Greg Isenberg's channel, video id `uJuxenfe-NU`, read on
2026-11-12 via caption transcript (no video frames). Everything below is
**the speaker's claim**, not a verified fact. Vendor, model and product names
came through auto-captions and several were phonetic ("Arabte", "Kai AI",
"foul", "seed dance", "Tessact"); they are normalized here to the most likely
real names, and the normalizations are **inferences**. Prices and model version
numbers are the speaker's figures for his own stack at that time and were not
checked. Treat this file as a reading of a source, not as documentation.

## The thesis

Work that used to require a graphic designer, a copywriter, a UGC creator, a
video editor and a motion-graphics artist is now "just code and tokens." The
operator's job shifts from doing the work to **building the environment an
agent needs** in order to do it — the speaker's image is a petri dish the agent
can thrive in — and then conducting. Four things make up that environment:

1. **Data.** A pipeline (he names Airbyte) into a warehouse (ClickHouse), with
   every source landing in one place: ad platforms, analytics, CRM, product
   analytics, payment processor. Point: query the warehouse, not the APIs. You
   can then attribute not just revenue but *customer lifetime value* back to a
   specific piece of creative.
2. **Access.** Platform API tokens — but **write-only, by discipline**. All
   reads come from the warehouse. His stated reason: agents fire thousands of
   requests and get accounts suspended for terms-of-service violations; the
   "agent got my ad account banned" stories are rate-limit abuse during data
   pulls, not the writes. His line: assume your agent is a drunk patron.
3. **Tools.** A unified model API (kie.ai) for image and video models, fal for
   voice cloning and transcription, OpenRouter for LLMs, Apollo or a lead-data
   provider for person data.
4. **Swipe warehouse.** Thousands of reference ads, shared across the team, not
   one person's bookmark folder. He names Sublime.app and Cosmos as tools for
   keeping it, and calls a shared repository of discovered workflows one of the
   most valuable assets a team can build.

He also pitches his own product (graft) as the assembled version of all four.
Disclosure: the host states he has no affiliation; the guest is raising a round.
Discount the product claims accordingly; the architecture is the useful part.

## Static ad workflow, as demonstrated

One command per brand, from a URL: extract the brand style guide from the site →
look up the brand's Facebook Ad Library entries → research pain points and
desired outcomes from Reddit and social conversation → propose five concepts as
headlines → generate the creative → upload into a named ad set via the Meta
Marketing API. Demonstrated live across roughly eight brands in parallel. The
brand guide can also be supplied as a markdown skill file (fonts, colors)
instead of scraped.

## Avatar/UGC video workflow, as demonstrated

The mechanic worth keeping: **do not send a bare script to a video model.** Send
three things together — the exact script, an MP3 of the script read by a cloned
voice, and a reference image of the presenter — so the model cannot invent the
wording or the face. He describes this as building a walled garden for the
model, and says it is the fix for both garbled enunciation and random faces.

Then:

- Render at low resolution (480p) and upscale afterwards with ffmpeg rather than
  paying for a high-resolution generation — his figure for 1080p was ~$14.
- Transcribe the render word-by-word and diff it against the script; isolate a
  mispronounced word by timestamp and patch that span instead of re-rendering.
- Add captions and motion graphics with a separate tool (Mirage's Tesseract),
  which also one-shot edits long-form video.
- Source the reference image from a **remixed real creator** (changed
  background, age, ethnicity) rather than a pure text-to-image face, which is
  his fix for the plastic look.
- Claimed cost: about $4–5 per finished ad versus $300–500 for the human
  equivalent; expectation of ~$3 soon. Claimed hit rate: roughly 95% usable,
  with occasional garbled generations accepted as cheaper than fixing.

## The quality gate

Raised by the host as "a creative director doing the first pass, scoring it like
a code review" and confirmed by the guest: a vision model inspects the candidate
frame by frame against a rubric, revises, re-inspects, and only passes work that
clears a bar (8–9 out of 10 was the number floated). He says they run exactly
this as a recursive loop for clients in regulated industries — finance — where
an image model checks the creative against a list of things that cannot be
promised, and it typically converges in two or three passes.

## Two framings worth stealing

- **Jobs to be done, not employees.** Do not build "God in a box" to run an ad
  account; he says they tried it at several companies and it was terrible.
  Instead ask what the top 1% media buyer actually does, and turn *that* into
  code with a thinking loop over a live data stream. Example he gives: auditing
  5,000 paid-search terms for buyer intent against the landing page before
  spending, which a human cannot do in twenty seconds.
- **Creative velocity feeds the algorithm.** With modern ad platforms the
  targeting is better than you are, so the lever is volume of good creative:
  ship cohorts of 30 rather than 10 a month, expect a given ad to take a couple
  of conversions and then stall, and move on. Cohort size follows from budget
  and cost per lead.
- **Provenance.** The prompt sent to the video model is a JSON blob; store it
  and tie it to that ad's performance, and you get parameter-level attribution
  across a thousand ads.

## Humans kept in the loop

Creator networks (he names Tribe and Sideshift) accessed **through their APIs**,
so the agent acts as the creator manager: send a script and brief to real
creators, pay per video (~$40 plus a performance bonus), then run the same
motion-graphics and caption pipeline over human footage instead of avatar
footage. And a human taste gate before anything goes live.

He also suggests grounding a creative-director agent in the canon — Ogilvy, plus
the best creative-advertising podcasts of the last two years — so it argues from
fundamentals.

## Deliberately not adopted in `/ad-engine`, and why

- **The data warehouse (Airbyte → ClickHouse).** No connected ad or analytics
  source on this account to feed it, so it would be scaffolding with no data.
  Consequence recorded honestly in the skill: no performance feedback loop.
- **Write access to ad platforms.** Not available here, and not something to
  acquire silently — publishing spends the practice's money.
- **Avatars portraying patients.** Rejected outright. A synthetic face giving a
  dental testimonial is a fabricated endorsement; the cheap-creative arithmetic
  does not price that risk. Avatars survive only as unnamed presenters.
- **"Ship 30 per cohort."** The reasoning is kept, the number is not: a
  single-location practice cannot give 30 variants enough spend to leave the
  learning phase.
- **95% usable / move fast on volume.** Inverted for a healthcare brand: the
  rubric gate comes first, and a bad render is thrown away rather than shipped
  as one of thirty.
