import type { AspectRatio } from "@/lib/video-providers/types";

/**
 * Contracts for the open-source avatar animation / lip-sync engine layer.
 *
 * Engines are external microservices (local Docker containers or remote GPU
 * endpoints) that all speak the same job contract:
 *   POST {API_URL}/jobs            → { jobId, status }
 *   GET  {API_URL}/jobs/{jobId}    → { jobId, status, progress, outputVideoUrl, error, metadata }
 *
 * The Next.js app only orchestrates jobs — no ML runs in-process. When an
 * engine's API_URL env var is unset, the provider falls back to a simulated
 * (mock-mode) job so the whole flow works with zero infrastructure.
 */

export const AVATAR_ENGINE_IDS = [
  "latentsync",
  "echomimic",
  "musetalk",
  "liveportrait",
  "videoretalking",
  "mock",
] as const;

export type AvatarEngineId = (typeof AVATAR_ENGINE_IDS)[number];

export const ENGINE_MODES = [
  "auto",
  "highest_quality",
  "fast_preview",
  "expressive",
  "portrait_animation",
  "video_retalking",
] as const;

/** User-facing generation goal; drives Auto engine routing. */
export type EngineMode = (typeof ENGINE_MODES)[number];

export type AvatarEngineCapabilityMode =
  | "lip_sync"
  | "portrait_animation"
  | "video_retalking"
  | "full_body_avatar";

export type AvatarEngineJobState =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface AvatarEngineInput {
  userId: string;
  projectId: string;
  script: string;
  /** Publicly fetchable speech audio driving the animation. */
  audioUrl: string;
  avatarImageUrl?: string | null;
  sourceVideoUrl?: string | null;
  language?: string;
  aspectRatio: AspectRatio;
  /** e.g. "neutral" | "happy" | "serious" | "sad" | "excited" */
  emotion?: string;
  /** 0..1 — how much head/expression motion to apply. */
  motionIntensity?: number;
  engineOptions?: Record<string, unknown>;
}

export interface AvatarEngineJob {
  engineId: string;
  jobId: string;
  status: AvatarEngineJobState;
  progress?: number | null;
  outputVideoUrl?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type AvatarEngineJobStatus = Omit<AvatarEngineJob, "engineId" | "jobId">;

export interface AvatarEngineProvider {
  id: string;
  name: string;
  mode: AvatarEngineCapabilityMode;
  supportsStillImage: boolean;
  supportsSourceVideo: boolean;
  supportsAudio: boolean;
  supportsRealtime: boolean;
  /** True when the engine's endpoint is configured (real jobs, not simulated). */
  isConfigured(): boolean;
  /** Throws AvatarEngineError(400) when required media is missing. */
  validateInput(input: AvatarEngineInput): void;
  createJob(input: AvatarEngineInput): Promise<AvatarEngineJob>;
  getJobStatus(jobId: string): Promise<AvatarEngineJobStatus>;
}

export class AvatarEngineError extends Error {
  constructor(
    message: string,
    public readonly engineId: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "AvatarEngineError";
  }
}
