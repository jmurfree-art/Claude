import "server-only";

import { HttpAvatarEngine } from "../http-engine";
import { AvatarEngineError } from "../types";

/**
 * EchoMimic — audio-driven expressive portrait animation
 * (https://github.com/antgroup/echomimic). Drives head motion and facial
 * expressions from speech audio, not just mouth/lip movement.
 *
 * TODO(deploy): stand up the microservice and set ECHOMIMIC_API_URL.
 *   Local Docker (NVIDIA GPU):
 *     1. git clone https://github.com/antgroup/echomimic
 *     2. Wrap inference in the shared jobs contract (POST /jobs,
 *        GET /jobs/{jobId} — see lib/avatar-engines/types.ts) behind a
 *        small FastAPI/Flask server in a CUDA container.
 *     3. docker run --gpus all -p 9102:8000 your/echomimic-service
 *     4. ECHOMIMIC_API_URL=http://127.0.0.1:9102
 *   Remote GPU: deploy the same container to RunPod/Modal/EC2-GPU and set
 *   ECHOMIMIC_API_URL=https://... plus ECHOMIMIC_API_KEY for auth.
 * Until then this provider runs simulated jobs (mock mode).
 */
export const echoMimicEngine = new HttpAvatarEngine({
  id: "echomimic",
  name: "EchoMimic",
  mode: "portrait_animation",
  supportsStillImage: true,
  supportsSourceVideo: false,
  supportsAudio: true,
  supportsRealtime: false,
  apiUrlEnv: "ECHOMIMIC_API_URL",
  apiKeyEnv: "ECHOMIMIC_API_KEY",
  validate: (input) => {
    if (!input.audioUrl) {
      throw new AvatarEngineError(
        "EchoMimic requires speech audio.",
        "echomimic",
        400
      );
    }
    if (!input.avatarImageUrl) {
      throw new AvatarEngineError(
        "EchoMimic requires a portrait image.",
        "echomimic",
        400
      );
    }
  },
});
