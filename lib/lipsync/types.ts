import type { AspectRatio } from "@/lib/video-providers/types";

/**
 * Provider-agnostic contracts for the lip-sync pipeline.
 *
 * A lip-sync provider takes already-generated speech audio plus a face
 * source (still avatar image or talking-head video) and returns a final
 * lip-synced MP4. The app talks only to `LipSyncProvider`; vendors are
 * registered in `lib/lipsync/index.ts`.
 */

export const LIPSYNC_ENGINES = [
  "auto",
  "heygen",
  "replicate",
  "fal",
  "mock",
] as const;

export type LipSyncEngine = (typeof LIPSYNC_ENGINES)[number];

export type LipSyncStatus = "pending" | "processing" | "completed" | "failed";

export interface LipSyncInput {
  userId: string;
  projectId: string;
  /** Still image of the presenter's face (used when no source video). */
  avatarImageUrl?: string | null;
  /** Talking-head source video to re-lip-sync. Takes precedence over the image. */
  sourceVideoUrl?: string | null;
  /** Publicly fetchable URL of the generated speech audio. */
  audioUrl: string;
  script: string;
  language: string;
  aspectRatio: AspectRatio;
  /** Vendor-specific knobs (e.g. { avatarId } for HeyGen). */
  providerOptions?: Record<string, unknown>;
}

export interface LipSyncJob {
  provider: string;
  jobId: string;
  status: LipSyncStatus;
  previewUrl?: string | null;
  outputVideoUrl?: string | null;
  error?: string | null;
}

export interface LipSyncJobStatus {
  status: LipSyncStatus;
  previewUrl?: string | null;
  outputVideoUrl?: string | null;
  error?: string | null;
}

export interface LipSyncProvider {
  name: string;
  createLipSyncJob(input: LipSyncInput): Promise<LipSyncJob>;
  getLipSyncStatus(jobId: string): Promise<LipSyncJobStatus>;
}

export class LipSyncProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "LipSyncProviderError";
  }
}
