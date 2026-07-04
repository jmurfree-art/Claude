import "server-only";

import { HttpAvatarEngine } from "../http-engine";
import { AvatarEngineError } from "../types";

/**
 * VideoReTalking — edits an existing talking-head video to match new audio
 * (https://github.com/OpenTalker/video-retalking). Used for dubbing/retalking
 * rather than animating a still portrait.
 *
 * TODO(deploy): stand up the microservice and set VIDEORETALKING_API_URL.
 *   Local Docker (NVIDIA GPU):
 *     1. git clone https://github.com/OpenTalker/video-retalking
 *     2. Wrap inference in the shared jobs contract (POST /jobs,
 *        GET /jobs/{jobId} — see lib/avatar-engines/types.ts) behind a
 *        small FastAPI/Flask server in a CUDA container.
 *     3. docker run --gpus all -p 9105:8000 your/video-retalking-service
 *     4. VIDEORETALKING_API_URL=http://127.0.0.1:9105
 *   Remote GPU: deploy the same container to RunPod/Modal/EC2-GPU and set
 *   VIDEORETALKING_API_URL=https://... plus VIDEORETALKING_API_KEY for auth.
 * Until then this provider runs simulated jobs (mock mode).
 */
export const videoReTalkingEngine = new HttpAvatarEngine({
  id: "videoretalking",
  name: "VideoReTalking",
  mode: "video_retalking",
  supportsStillImage: false,
  supportsSourceVideo: true,
  supportsAudio: true,
  supportsRealtime: false,
  apiUrlEnv: "VIDEORETALKING_API_URL",
  apiKeyEnv: "VIDEORETALKING_API_KEY",
  validate: (input) => {
    if (!input.audioUrl) {
      throw new AvatarEngineError(
        "VideoReTalking requires speech audio.",
        "videoretalking",
        400
      );
    }
    if (!input.sourceVideoUrl) {
      throw new AvatarEngineError(
        "VideoReTalking requires an existing source video.",
        "videoretalking",
        400
      );
    }
  },
});
