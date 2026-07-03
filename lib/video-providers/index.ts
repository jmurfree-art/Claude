import "server-only";

import { DuixProvider } from "./duix";
import { HeyGenProvider } from "./heygen";
import { MockProvider } from "./mock";
import type { VideoProvider } from "./types";

let cached: VideoProvider | null = null;

/**
 * Returns the active video provider.
 *
 * Selection order:
 * 1. `VIDEO_PROVIDER` env var, if set: "heygen" | "duix" | "mock"
 * 2. Otherwise "heygen" when `HEYGEN_API_KEY` is present
 * 3. Otherwise mock mode (simulated renders, no external calls)
 *
 * To add another vendor, implement `VideoProvider` and register it here.
 */
export function getVideoProvider(): VideoProvider {
  if (cached) return cached;
  cached = selectProvider();
  return cached;
}

function selectProvider(): VideoProvider {
  const explicit = process.env.VIDEO_PROVIDER?.toLowerCase();
  switch (explicit) {
    case "heygen":
      return new HeyGenProvider(process.env.HEYGEN_API_KEY ?? "");
    case "duix":
      return new DuixProvider();
    case "mock":
      return new MockProvider();
    case undefined:
    case "":
      return process.env.HEYGEN_API_KEY
        ? new HeyGenProvider(process.env.HEYGEN_API_KEY)
        : new MockProvider();
    default:
      throw new Error(`Unknown VIDEO_PROVIDER: ${explicit}`);
  }
}

/** True when the app is running the simulated provider. */
export function isMockMode(): boolean {
  return getVideoProvider().name === "mock";
}
