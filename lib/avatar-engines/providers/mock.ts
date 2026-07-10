import "server-only";

import { HttpAvatarEngine } from "../http-engine";

/**
 * Mock avatar engine — always available, never configured, so every job
 * runs the simulated queued → processing → completed lifecycle built into
 * HttpAvatarEngine. Lets the whole avatar-engine flow (create, poll,
 * progress, preview, download) be exercised with zero keys or GPUs.
 */
export const mockAvatarEngine = new HttpAvatarEngine({
  id: "mock",
  name: "Mock (simulated)",
  mode: "lip_sync",
  supportsStillImage: true,
  supportsSourceVideo: true,
  supportsAudio: true,
  supportsRealtime: true,
  // Intentionally unresolvable env vars: the mock must never hit a network.
  apiUrlEnv: "MOCK_AVATAR_ENGINE_API_URL_UNSET",
  apiKeyEnv: "MOCK_AVATAR_ENGINE_API_KEY_UNSET",
  validate: () => {
    // The mock accepts any combination of inputs.
  },
});
