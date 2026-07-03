import "server-only";

import { DuixProvider } from "./duix";
import { HeyGenProvider } from "./heygen";
import { LocalProvider } from "./local";
import { MockProvider } from "./mock";
import type { VideoProvider } from "./types";

let cached: VideoProvider | null = null;

/**
 * Returns the active video provider.
 *
 * Selection order:
 * 1. `VIDEO_PROVIDER` env var, if set: "heygen" | "local" | "duix" | "mock"
 * 2. Otherwise "heygen" when `HEYGEN_API_KEY` is present
 * 3. Otherwise "local" — completely free renders (Edge neural TTS + ffmpeg),
 *    no API key or subscription required. Needs ffmpeg installed; set
 *    VIDEO_PROVIDER=mock for a zero-dependency simulated pipeline instead.
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
    case "local":
      return new LocalProvider();
    case "duix":
      return new DuixProvider();
    case "mock":
      return new MockProvider();
    case undefined:
    case "":
      return process.env.HEYGEN_API_KEY
        ? new HeyGenProvider(process.env.HEYGEN_API_KEY)
        : new LocalProvider();
    default:
      throw new Error(`Unknown VIDEO_PROVIDER: ${explicit}`);
  }
}

/** True when the app is running the simulated provider. */
export function isMockMode(): boolean {
  return getVideoProvider().name === "mock";
}
