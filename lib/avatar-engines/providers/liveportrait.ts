import "server-only";

import { HttpAvatarEngine } from "../http-engine";
import { AvatarEngineError } from "../types";

/**
 * LivePortrait — portrait animation with stitching/retargeting control
 * (https://github.com/KwaiVGI/LivePortrait). Drives a still portrait with a
 * driving video (or audio-derived motion).
 *
 * TODO(deploy): stand up the microservice and set LIVEPORTRAIT_API_URL.
 *   Local Docker (NVIDIA GPU):
 *     1. git clone https://github.com/KwaiVGI/LivePortrait
 *     2. Wrap inference in the shared jobs contract (POST /jobs,
 *        GET /jobs/{jobId} — see lib/avatar-engines/types.ts) behind a
 *        small FastAPI/Flask server in a CUDA container.
 *     3. docker run --gpus all -p 9104:8000 your/liveportrait-service
 *     4. LIVEPORTRAIT_API_URL=http://127.0.0.1:9104
 *   Remote GPU: deploy the same container to RunPod/Modal/EC2-GPU and set
 *   LIVEPORTRAIT_API_URL=https://... plus LIVEPORTRAIT_API_KEY for auth.
 * Until then this provider runs simulated jobs (mock mode).
 */
export const livePortraitEngine = new HttpAvatarEngine({
  id: "liveportrait",
  name: "LivePortrait",
  mode: "portrait_animation",
  supportsStillImage: true,
  supportsSourceVideo: true,
  supportsAudio: true,
  supportsRealtime: true,
  apiUrlEnv: "LIVEPORTRAIT_API_URL",
  apiKeyEnv: "LIVEPORTRAIT_API_KEY",
  validate: (input) => {
    if (!input.avatarImageUrl) {
      throw new AvatarEngineError(
        "LivePortrait requires a portrait image.",
        "liveportrait",
        400
      );
    }
  },
});
