# wav2lip-service

Free, local lip-sync rendering on your own NVIDIA GPU — no per-minute tokens,
no third-party API. Self-hosted on Windows (no Docker), wrapping
[Rudrabha/Wav2Lip](https://github.com/Rudrabha/Wav2Lip)'s `inference.py` CLI
behind the same jobs HTTP contract used by this repo's avatar-engine layer
(`lib/avatar-engines/http-engine.ts`):

- `POST /jobs` — queue a lip-sync render from an audio track + a still image
  or source video.
- `GET /jobs/{jobId}` — poll status/progress, and get `outputVideoUrl` once
  `status` is `completed`.
- `GET /files/{jobId}.mp4` — serves the rendered output.
- `GET /healthz` — liveness check.

## Prerequisites

- Windows 10/11 with an NVIDIA GPU + driver (an RTX 4070 is plenty for
  Wav2Lip; even older/smaller GPUs generally work, just slower).
- [Python 3.10](https://www.python.org/downloads/) on PATH.
- [Git for Windows](https://git-scm.com/download/win) on PATH.
- `curl` (ships with Windows 10/11) for downloading model weights.

## Setup (once)

```bat
setup.bat
```

Takes about 5-10 minutes: clones Wav2Lip, creates a Python venv, installs
torch (CUDA 12.1 wheels) + Wav2Lip's + this service's own requirements, and
downloads `wav2lip_gan.pth` and `s3fd.pth` into the right folders under
`Wav2Lip\`. Safe to re-run — it skips steps (clone/venv/weights) that are
already done.

## Run it

```bat
run.bat
```

Starts the service on `http://127.0.0.1:9106`.

Then, in the main app's `.env.local`:

```
WAV2LIP_API_URL=http://127.0.0.1:9106
# only if WAV2LIP_SERVICE_API_KEY is set on the service:
WAV2LIP_API_KEY=<same key>
```

...and restart the Next.js app.

## Notes

- `--face` accepts either a still image (jpg/png, used as a single static
  frame) or a video (mp4) — both `avatarImageUrl` and `sourceVideoUrl` work;
  `sourceVideoUrl` is preferred when both are supplied.
- If a job's status ends up `failed`, check `jobs\<jobId>\log.txt` for the
  full `inference.py` output (the same tail is echoed into the job's `error`
  field).
- Optional per-job tuning via the `options` object in `POST /jobs`:
  - `pads`: string like `"0 10 0 0"` or an array `[0, 10, 0, 0]` (top/bottom/left/right), forwarded as `--pads`.
  - `resize_factor`: integer, forwarded as `--resize_factor`.
  - `nosmooth`: boolean, forwarded as `--nosmooth`.
  - `checkpoint_path`: override which checkpoint to use (e.g. switch from
    `wav2lip_gan.pth` to `wav2lip.pth` if you've downloaded it separately).
- The model weight URLs baked into `setup.bat` are a known-good third-party
  mirror as of when this service was written. If they start 404ing, search
  "Wav2Lip wav2lip_gan.pth download" / "Wav2Lip s3fd.pth download" for a
  current mirror and either edit `setup.bat` or drop the files manually into
  `Wav2Lip\checkpoints\wav2lip_gan.pth` and
  `Wav2Lip\face_detection\detection\sfd\s3fd.pth`.

## API examples

```bash
curl -X POST http://127.0.0.1:9106/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WAV2LIP_SERVICE_API_KEY" \
  -d '{
    "projectId": "proj_123",
    "userId": "user_456",
    "audioUrl": "https://example.com/audio.wav",
    "avatarImageUrl": "https://example.com/avatar.jpg",
    "sourceVideoUrl": null,
    "script": "Hello world",
    "language": "en",
    "aspectRatio": "16:9",
    "emotion": "neutral",
    "motionIntensity": 0.5,
    "options": {}
  }'
# -> {"jobId": "0123abcd...", "status": "queued"}

curl http://127.0.0.1:9106/jobs/0123abcd... \
  -H "Authorization: Bearer $WAV2LIP_SERVICE_API_KEY"
# -> {"jobId": "...", "status": "processing", "progress": 30,
#     "outputVideoUrl": null, "error": null, "metadata": {}}
```

Omit the `Authorization` header entirely if `WAV2LIP_SERVICE_API_KEY` is
unset on the service (both routes are unauthenticated in that case).
