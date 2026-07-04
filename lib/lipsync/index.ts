import "server-only";

import { FalLipSyncProvider } from "./providers/fal";
import { HeyGenLipSyncProvider } from "./providers/heygen";
import { MockLipSyncProvider } from "./providers/mock";
import { ReplicateLipSyncProvider } from "./providers/replicate";
import {
  LipSyncProviderError,
  type LipSyncEngine,
  type LipSyncProvider,
} from "./types";

/**
 * Resolves the lip-sync provider for a request.
 *
 * "auto" priority: HeyGen (HEYGEN_API_KEY) → Replicate (REPLICATE_API_TOKEN)
 * → fal MuseTalk (FAL_KEY) → mock (simulated completion, no keys needed).
 * An explicit engine bypasses the priority list but still validates that
 * its credentials are configured.
 */
export function resolveLipSyncProvider(
  engine: LipSyncEngine
): LipSyncProvider {
  switch (engine) {
    case "heygen":
      requireEnv("HEYGEN_API_KEY", "heygen");
      return new HeyGenLipSyncProvider(process.env.HEYGEN_API_KEY!);
    case "replicate":
      requireEnv("REPLICATE_API_TOKEN", "replicate");
      return new ReplicateLipSyncProvider(process.env.REPLICATE_API_TOKEN!);
    case "fal":
      requireEnv("FAL_KEY", "fal");
      return new FalLipSyncProvider(process.env.FAL_KEY!);
    case "mock":
      return new MockLipSyncProvider();
    case "auto":
      if (process.env.HEYGEN_API_KEY) {
        return new HeyGenLipSyncProvider(process.env.HEYGEN_API_KEY);
      }
      if (process.env.REPLICATE_API_TOKEN) {
        return new ReplicateLipSyncProvider(process.env.REPLICATE_API_TOKEN);
      }
      if (process.env.FAL_KEY) {
        return new FalLipSyncProvider(process.env.FAL_KEY);
      }
      return new MockLipSyncProvider();
  }
}

/** Re-resolves a provider by its stored `name` for status polling. */
export function getLipSyncProviderByName(name: string): LipSyncProvider {
  switch (name) {
    case "heygen":
    case "replicate":
    case "fal":
    case "mock":
      return resolveLipSyncProvider(name);
    default:
      throw new LipSyncProviderError(
        `Unknown lip-sync provider: ${name}`,
        name,
        400
      );
  }
}

function requireEnv(key: string, provider: string): void {
  if (!process.env[key]) {
    throw new LipSyncProviderError(
      `${key} is not configured — set it or choose a different lip-sync engine.`,
      provider,
      400
    );
  }
}
