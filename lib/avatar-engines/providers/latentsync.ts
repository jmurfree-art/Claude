import "server-only";

import { HttpAvatarEngine } from "../http-engine";
import { AvatarEngineError } from "../types";

/**
 * LatentSync — ByteDance's diffusion-based lip-sync
 * (https://github.com/bytedance/LatentSync). Highest-quality mouth sync;
 * slower than MuseTalk. Drives a still portrait or an existing video with
 * speech audio.
 *
 * TODO(deploy): stand up the microservice and set LATENTSYNC_API_URL.
 *   Local Docker (NVIDIA GPU, ~10 GB VRAM):
 *     1. git clone https://github.com/bytedance/LatentSync
 *     2. Wrap inference in the shared jobs contract (POST /jobs,
 *        GET /jobs/{jobId} — see lib/avatar-engines/types.ts) behind a
 *        small FastAPI/Flask server in a CUDA container.
 *     3. docker run --gpus all -p 9101:8000 your/latentsync-service
 *     4. LATENTSYNC_API_URL=http://127.0.0.1:9101
 *   Remote GPU: deploy the same container to RunPod/Modal/EC2-GPU and set
 *   LATENTSYNC_API_URL=https://... plus LATENTSYNC_API_KEY for auth.
 * Until then this provider runs simulated jobs (mock mode).
 */
export const latentSyncEngine = new HttpAvatarEngine({
  id: "latentsync",
  name: "LatentSync",
  mode: "lip_sync",
  supportsStillImage: true,
  supportsSourceVideo: true,
  supportsAudio: true,
  supportsRealtime: false,
  apiUrlEnv: "LATENTSYNC_API_URL",
  apiKeyEnv: "LATENTSYNC_API_KEY",
  validate: (input) => {
    if (!input.audioUrl) {
      throw new AvatarEngineError(
        "LatentSync requires speech audio.",
        "latentsync",
        400
      );
    }
    if (!input.sourceVideoUrl && !input.avatarImageUrl) {
      throw new AvatarEngineError(
        "LatentSync requires a source video or an avatar image.",
        "latentsync",
        400
      );
    }
  },
});
