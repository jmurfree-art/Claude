import "server-only";

import { HttpAvatarEngine } from "../http-engine";
import { AvatarEngineError } from "../types";

/**
 * MuseTalk (self-hosted) — real-time-capable lip-sync for fast previews
 * (https://github.com/TMElyralab/MuseTalk). Drives a still portrait or an
 * existing video with speech audio.
 *
 * Note: this is the SELF-HOSTED MuseTalk microservice. A cloud-hosted
 * MuseTalk is already available via fal.ai in lib/lipsync/providers/fal.ts —
 * prefer that one unless you specifically need a self-managed deployment.
 *
 * TODO(deploy): stand up the microservice and set MUSETALK_API_URL.
 *   Local Docker (NVIDIA GPU):
 *     1. git clone https://github.com/TMElyralab/MuseTalk
 *     2. Wrap inference in the shared jobs contract (POST /jobs,
 *        GET /jobs/{jobId} — see lib/avatar-engines/types.ts) behind a
 *        small FastAPI/Flask server in a CUDA container.
 *     3. docker run --gpus all -p 9103:8000 your/musetalk-service
 *     4. MUSETALK_API_URL=http://127.0.0.1:9103
 *   Remote GPU: deploy the same container to RunPod/Modal/EC2-GPU and set
 *   MUSETALK_API_URL=https://... plus MUSETALK_API_KEY for auth.
 * Until then this provider runs simulated jobs (mock mode).
 */
export const museTalkEngine = new HttpAvatarEngine({
  id: "musetalk",
  name: "MuseTalk (self-hosted)",
  mode: "lip_sync",
  supportsStillImage: true,
  supportsSourceVideo: true,
  supportsAudio: true,
  supportsRealtime: true,
  apiUrlEnv: "MUSETALK_API_URL",
  apiKeyEnv: "MUSETALK_API_KEY",
  validate: (input) => {
    if (!input.audioUrl) {
      throw new AvatarEngineError(
        "MuseTalk requires speech audio.",
        "musetalk",
        400
      );
    }
    if (!input.avatarImageUrl && !input.sourceVideoUrl) {
      throw new AvatarEngineError(
        "MuseTalk requires a source video or an avatar image.",
        "musetalk",
        400
      );
    }
  },
});
