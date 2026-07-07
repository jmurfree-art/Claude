import "server-only";

import type {
  AvatarEngineId,
  AvatarEngineProvider,
  EngineMode,
} from "./types";

/**
 * Auto-routing between engines.
 *
 * Manual selection always wins (even when the engine isn't configured — it
 * then runs a simulated job, which is useful before infrastructure exists).
 * "Auto" picks by goal, preferring configured engines and falling back to
 * the mock provider when nothing real is deployed:
 *
 *   video_retalking / source video present → VideoReTalking
 *   expressive motion on a still image     → EchoMimic
 *   fast preview / realtime                → MuseTalk
 *   highest-quality lip-sync               → LatentSync
 *   portrait animation only                → LivePortrait
 */
export function resolveAvatarEngine(options: {
  engine: AvatarEngineId | "auto";
  mode: EngineMode;
  hasSourceVideo: boolean;
  hasAvatarImage: boolean;
  getEngine: (id: AvatarEngineId) => AvatarEngineProvider;
}): AvatarEngineProvider {
  const { engine, mode, hasSourceVideo, hasAvatarImage, getEngine } = options;

  if (engine !== "auto") {
    return getEngine(engine);
  }

  const candidates = candidatesForMode(mode, hasSourceVideo, hasAvatarImage);

  for (const id of candidates) {
    const provider = getEngine(id);
    if (provider.isConfigured()) return provider;
  }

  // No configured engine — simulate so the flow still completes.
  return getEngine("mock");
}

function candidatesForMode(
  mode: EngineMode,
  hasSourceVideo: boolean,
  hasAvatarImage: boolean
): AvatarEngineId[] {
  switch (mode) {
    case "video_retalking":
      return ["videoretalking", "latentsync", "musetalk", "wav2lip"];
    case "expressive":
      return ["echomimic", "liveportrait", "latentsync"];
    case "fast_preview":
      return ["wav2lip", "musetalk", "liveportrait", "latentsync"];
    case "highest_quality":
      return ["latentsync", "musetalk", "echomimic", "wav2lip"];
    case "portrait_animation":
      return ["liveportrait", "echomimic"];
    case "auto":
      // Infer the goal from the provided media. wav2lip is the most
      // commonly self-hosted engine, so it leads the lip-sync fallbacks.
      if (hasSourceVideo)
        return ["videoretalking", "wav2lip", "latentsync", "musetalk"];
      if (hasAvatarImage)
        return ["wav2lip", "musetalk", "echomimic", "latentsync", "liveportrait"];
      return ["wav2lip", "latentsync", "musetalk", "echomimic", "liveportrait"];
  }
}
