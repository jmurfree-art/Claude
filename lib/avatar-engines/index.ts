import "server-only";

import { echoMimicEngine } from "./providers/echomimic";
import { latentSyncEngine } from "./providers/latentsync";
import { livePortraitEngine } from "./providers/liveportrait";
import { mockAvatarEngine } from "./providers/mock";
import { museTalkEngine } from "./providers/musetalk";
import { videoReTalkingEngine } from "./providers/videoretalking";
import { wav2LipEngine } from "./providers/wav2lip";
import {
  AvatarEngineError,
  type AvatarEngineId,
  type AvatarEngineProvider,
} from "./types";

export { resolveAvatarEngine } from "./engine-router";

const ENGINES: Record<AvatarEngineId, AvatarEngineProvider> = {
  wav2lip: wav2LipEngine,
  latentsync: latentSyncEngine,
  echomimic: echoMimicEngine,
  musetalk: museTalkEngine,
  liveportrait: livePortraitEngine,
  videoretalking: videoReTalkingEngine,
  mock: mockAvatarEngine,
};

export function getAvatarEngine(id: string): AvatarEngineProvider {
  const engine = ENGINES[id as AvatarEngineId];
  if (!engine) {
    throw new AvatarEngineError(`Unknown avatar engine: ${id}`, id, 400);
  }
  return engine;
}

export function listAvatarEngines(): AvatarEngineProvider[] {
  return Object.values(ENGINES);
}
