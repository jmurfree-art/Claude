# "The Quiet Change" — 20s Invisalign spot for Murfree Dental, via ComfyUI

A complete, runnable package: creative design + ComfyUI pipeline + driver script + brand endcard. Everything except the GPU render itself was built and verified in-session; the render runs on your machine (or any rented GPU box) because video diffusion needs a GPU this environment doesn't have.

## The spot (design)

One woman's ordinary week; the aligner is the quiet companion. Four 5-second shots, hard cuts, one consistent warm teal/coral grade:

| Shot | 0:00–0:20 | Beat |
|---|---|---|
| 1 | Morning mirror — she seats the aligner, half-smile | The product, demystified |
| 2 | Glass meeting room — laughing mid-presentation | Nobody notices |
| 3 | Golden-hour dinner — aligner case beside her plate | Life, uninterrupted |
| 4 | Dusk shop window — she catches her reflection, real smile → **endcard** | The quiet change |

**Voiceover (~19s, record or 1 Higgsfield credit):** in `shots.json`, with beat timing. Compliance-checked: no outcome guarantees, Invisalign® named, claims stay inside the practice's verified positioning.

## Hardware & model reality (verified against official docs)

- Pipeline: **Wan 2.2 TI2V-5B**, ComfyUI-native. ~**8 GB VRAM** class (fits a 3060 Ti/4060; comfortable on 12 GB+), 704×1280 vertical @ 24 fps, 121 frames ≈ 5 s per shot. Expect roughly 5–15 min/shot on a mid GPU, so ~20–60 min for all four.
- Three model files (~10 GB total), placed under your ComfyUI folder:
  - `models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors`
  - `models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`
  - `models/vae/wan2.2_vae.safetensors`
  - Download links live in the official guide: https://docs.comfy.org/tutorials/video/wan/wan2_2 (also mirrored in the in-app template, next bullet).
- No GPU at home? A rented pod (RunPod/Thunder, ~$0.30–0.60/hr) runs the whole spot for well under a dollar.

## Run it — two routes

**Route 1 (no scripts): ComfyUI's built-in template.** ComfyUI → *Workflow → Browse Templates → Video → Wan 2.2 5B video generation*. It prompts you to download the exact three models. Then paste each shot's prompt + the shared negative from `shots.json`, set 704×1280 / length 121, queue four times.

**Route 2 (one command): the driver.** Start ComfyUI, then:

```bash
python3 run_ad.py                 # renders all 4 shots to output/murfree_invisalign/
python3 run_ad.py --dry-run       # inspect payloads without a server
python3 run_ad.py --shots shot3_dinner --seed 7   # re-roll one shot
python3 run_ad.py --save webp     # if your ComfyUI predates the SaveVideo node
```

Stdlib-only; posts each shot to the ComfyUI API and polls to completion. `--host http://<ip>:8188` drives a remote box — **expose your ComfyUI via a tunnel (e.g. `cloudflared tunnel --url http://127.0.0.1:8188`) and Claude can drive the render and re-rolls for you from a session.**

## Assemble (free, ~15 min in CapCut/Resolve)

1. Shots 1→4 in order, hard cuts (trim each to best ~5 s).
2. VO from `shots.json` over the cut; music: minimal warm piano, ducked under VO.
3. At ~0:18, cut to `endcard.png` (rendered by `endcard.py`, 1080×1920) and hold through the brand line.
4. Auto-captions on (muted autoplay), export 1080×1920.

## Honesty ledger

- **Verified here:** both scripts compile; the driver's payloads build correctly (`--dry-run`); the endcard is rendered and visually reviewed; model filenames/paths and node pipeline match the official ComfyUI Wan 2.2 guide.
- **Not verifiable here:** the actual render (no GPU) — sampler defaults (steps 20 / cfg 5 / uni_pc / shift 8) mirror the official template, but if your template ships different defaults, trust the template. Character consistency across the four shots is the known weak point of any per-shot generation — `shots.json` includes the re-roll strategy and a "four patients" fallback variant that sidesteps it entirely.
- AI depicts only fictional patients; no AI stand-in for Dr. Murfree.

Sources: [ComfyUI official Wan 2.2 workflow](https://docs.comfy.org/tutorials/video/wan/wan2_2) · [ComfyUI Wan 2.2 examples](https://comfyanonymous.github.io/ComfyUI_examples/wan22/) · [VRAM guide](https://willitrunai.com/video-models/wan-video-2-2-ti2v-5b) · [RunPod guide](https://www.runpod.io/articles/guides/comfyui-wan-2-2)
