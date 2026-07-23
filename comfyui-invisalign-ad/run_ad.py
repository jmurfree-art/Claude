#!/usr/bin/env python3
"""Drive a local ComfyUI to render the 20s Murfree Dental Invisalign spot.

Renders the 4 shots in shots.json through the native Wan 2.2 TI2V-5B
pipeline, one job per shot, and reports the output files. Stdlib only.

Usage:
  python3 run_ad.py --dry-run              # print the job payloads, no server needed
  python3 run_ad.py                        # render all 4 shots on http://127.0.0.1:8188
  python3 run_ad.py --host http://HOST:8188 --shots shot3_dinner --seed 7
  python3 run_ad.py --save webp            # if your ComfyUI predates the SaveVideo node

Model files required (see README.md for download locations):
  models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors
  models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors
  models/vae/wan2.2_vae.safetensors
"""
import argparse
import contextlib
import json
import signal
import sys
import time

with contextlib.suppress(Exception):  # don't crash when piped into head
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
import urllib.error
import urllib.request
from pathlib import Path

UNET = "wan2.2_ti2v_5B_fp16.safetensors"
CLIP = "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
VAE = "wan2.2_vae.safetensors"


def build_graph(prompt, negative, width, height, frames, fps, seed, steps, cfg, prefix, save):
    g = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": CLIP, "type": "wan", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "ModelSamplingSD3",
              "inputs": {"model": ["1", 0], "shift": 8.0}},
        "5": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 0], "text": negative}},
        "7": {"class_type": "Wan22ImageToVideoLatent",
              "inputs": {"vae": ["3", 0], "width": width, "height": height,
                         "length": frames, "batch_size": 1}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0],
                         "latent_image": ["7", 0], "seed": seed, "steps": steps,
                         "cfg": cfg, "sampler_name": "uni_pc", "scheduler": "simple",
                         "denoise": 1.0}},
        "9": {"class_type": "VAEDecode",
              "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
    }
    if save == "webp":
        g["10"] = {"class_type": "SaveAnimatedWEBP",
                   "inputs": {"images": ["9", 0], "filename_prefix": prefix,
                              "fps": float(fps), "lossless": False,
                              "quality": 90, "method": "default"}}
    else:
        g["10"] = {"class_type": "CreateVideo",
                   "inputs": {"images": ["9", 0], "fps": float(fps)}}
        g["11"] = {"class_type": "SaveVideo",
                   "inputs": {"video": ["10", 0], "filename_prefix": prefix,
                              "format": "mp4", "codec": "h264"}}
    return g


def post_json(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read())


def wait_for(host, prompt_id, label, poll=5):
    print(f"  [{label}] queued as {prompt_id}; polling every {poll}s ...")
    start = time.time()
    while True:
        time.sleep(poll)
        try:
            hist = get_json(f"{host}/history/{prompt_id}")
        except (urllib.error.URLError, OSError) as e:
            print(f"  [{label}] poll error ({e}); retrying")
            continue
        entry = hist.get(prompt_id)
        if not entry:
            continue
        status = entry.get("status", {})
        if status.get("status_str") == "error":
            msgs = [m for m in status.get("messages", []) if m and m[0] == "execution_error"]
            sys.exit(f"  [{label}] FAILED on the server: {json.dumps(msgs)[:800]}")
        outputs = entry.get("outputs", {})
        if outputs:
            files = []
            for node_out in outputs.values():
                for key in ("images", "gifs", "video", "videos"):
                    for f in node_out.get(key, []) or []:
                        files.append(f.get("filename"))
            mins = (time.time() - start) / 60
            print(f"  [{label}] DONE in {mins:.1f} min -> {files or '(see ComfyUI output dir)'}")
            return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="http://127.0.0.1:8188")
    ap.add_argument("--shots", nargs="*", help="shot ids to render (default: all)")
    ap.add_argument("--seed", type=int, default=1140, help="base seed; shot N uses seed+N")
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--cfg", type=float, default=5.0)
    ap.add_argument("--frames", type=int, default=None, help="override frames per shot")
    ap.add_argument("--save", choices=["mp4", "webp"], default="mp4")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    spec = json.loads((Path(__file__).parent / "shots.json").read_text())
    fmt = spec["format"]
    frames = args.frames or fmt["frames_per_shot"]
    shots = [s for s in spec["shots"] if not args.shots or s["id"] in args.shots]
    if not shots:
        sys.exit(f"no shots matched {args.shots}; available: {[s['id'] for s in spec['shots']]}")

    print(f"{spec['title']}\n{len(shots)} shot(s) @ {fmt['width']}x{fmt['height']}, "
          f"{frames} frames, {fmt['fps']} fps, save={args.save}\n")

    for i, shot in enumerate(shots):
        graph = build_graph(shot["prompt"], spec["negative_prompt"],
                            fmt["width"], fmt["height"], frames, fmt["fps"],
                            args.seed + i, args.steps, args.cfg,
                            f"murfree_invisalign/{shot['id']}", args.save)
        if args.dry_run:
            print(f"--- {shot['id']} ({shot['seconds']}s) payload ---")
            print(json.dumps({"prompt": graph}, indent=1)[:1200], "...\n")
            continue
        try:
            resp = post_json(f"{args.host}/prompt", {"prompt": graph})
        except (urllib.error.URLError, OSError) as e:
            sys.exit(f"Cannot reach ComfyUI at {args.host} ({e}). Is it running with --listen?")
        err = resp.get("error") or resp.get("node_errors")
        if err:
            sys.exit(f"[{shot['id']}] rejected by server: {json.dumps(err)[:800]}\n"
                     "If SaveVideo/CreateVideo is unknown, update ComfyUI or rerun with --save webp.")
        wait_for(args.host, resp["prompt_id"], shot["id"])

    if not args.dry_run:
        print("\nAll shots rendered. Assemble in order with the VO from shots.json, "
              "then cut to endcard.png for the final beat (see README.md).")


if __name__ == "__main__":
    main()
