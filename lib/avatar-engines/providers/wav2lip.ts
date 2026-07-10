import "server-only";

import { HttpAvatarEngine } from "../http-engine";
import { AvatarEngineError } from "../types";

/**
 * Wav2Lip — classic, reliable lip-sync (https://github.com/Rudrabha/Wav2Lip).
 * Drives a still photo OR a video with speech audio. The most dependable
 * self-hosted engine to install on Windows (no Docker) and light enough to
 * run fast on a consumer NVIDIA GPU (e.g. RTX 4070).
 *
 * TODO(deploy): the reference service lives in engines/wav2lip-service/.
 *   Local (Windows, NVIDIA GPU):
 *     1. cd engines\wav2lip-service && setup.bat   (one-time: venv + weights)
 *     2. run.bat                                    (serves on port 9106)
 *     3. set WAV2LIP_API_URL=http://127.0.0.1:9106 in .env.local
 *   Remote GPU: host the same service and set WAV2LIP_API_URL=https://…
 *   plus WAV2LIP_API_KEY (sent as a Bearer token).
 * Until WAV2LIP_API_URL is set this provider runs simulated jobs (mock mode).
 */
export const wav2LipEngine = new HttpAvatarEngine({
  id: "wav2lip",
  name: "Wav2Lip (self-hosted)",
  mode: "lip_sync",
  supportsStillImage: true,
  supportsSourceVideo: true,
  supportsAudio: true,
  supportsRealtime: false,
  apiUrlEnv: "WAV2LIP_API_URL",
  apiKeyEnv: "WAV2LIP_API_KEY",
  validate: (input) => {
    if (!input.audioUrl) {
      throw new AvatarEngineError(
        "Wav2Lip requires speech audio.",
        "wav2lip",
        400
      );
    }
    if (!input.sourceVideoUrl && !input.avatarImageUrl) {
      throw new AvatarEngineError(
        "Wav2Lip requires a face image or a source video.",
        "wav2lip",
        400
      );
    }
  },
});
