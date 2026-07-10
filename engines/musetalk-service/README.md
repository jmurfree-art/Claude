# musetalk-service

A self-hosted inference microservice that wraps
[TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk) behind the
jobs HTTP contract used by this repo's avatar-engine layer
(`lib/avatar-engines/http-engine.ts`):

- `POST /jobs` — queue a lip-sync render from an audio track + a still image
  or source video.
- `GET /jobs/{jobId}` — poll status/progress, and get `outputVideoUrl` once
  `status` is `completed`.
- `GET /files/{jobId}.mp4` — serves the rendered output.
- `GET /healthz` — liveness check.

## GPU prerequisites

- An NVIDIA GPU + driver, matching the CUDA 11.7 runtime used by the base
  image.
- [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
  installed so Docker can see the GPU (`docker run --gpus all ...`).

## Model weights

The image does **not** bake in MuseTalk's ~10GB of model weights by default
(see the comment block in `Dockerfile`). Instead:

```bash
git clone --depth 1 https://github.com/TMElyralab/MuseTalk /tmp/MuseTalk
cd /tmp/MuseTalk
sh ./download_weights.sh
# copy (or symlink) the resulting weights into ./models next to this README
cp -r ./models/* /home/user/Datadump/engines/musetalk-service/models/
```

`docker-compose.yml` mounts `./models` to `/opt/MuseTalk/models` inside the
container, so the weights just need to exist on the host at build/run time.

## Run it

```bash
cd engines/musetalk-service
docker compose up --build
```

The service listens on `http://127.0.0.1:9103`.

Then, in the main app's environment, point the MuseTalk avatar engine at it:

```
MUSETALK_API_URL=http://127.0.0.1:9103
# only if MUSETALK_SERVICE_API_KEY is set on the service:
MUSETALK_API_KEY=<same key>
```

## API examples

```bash
curl -X POST http://127.0.0.1:9103/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MUSETALK_SERVICE_API_KEY" \
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

curl http://127.0.0.1:9103/jobs/0123abcd... \
  -H "Authorization: Bearer $MUSETALK_SERVICE_API_KEY"
# -> {"jobId": "...", "status": "processing", "progress": 30,
#     "outputVideoUrl": null, "error": null, "metadata": {}}
```

Omit the `Authorization` header entirely if `MUSETALK_SERVICE_API_KEY` is
unset on the service (both routes are unauthenticated in that case).

## Verify on your GPU box

The exact `scripts.inference` CLI flags in `app.py` (`--unet_model_path`,
`--unet_config`, `--version v15`, etc.) match the MuseTalk README at the time
this service was written, but MuseTalk's CLI has changed shape across
releases. If a job goes to `failed`, check `<WORK_DIR>/<jobId>/log.txt`
(the tail of it is also copied into the job's `error` field) — a flag
mismatch or missing weight file usually shows up there immediately.
