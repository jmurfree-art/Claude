import "server-only";

import {
  AvatarEngineError,
  type AvatarEngineInput,
  type AvatarEngineJob,
  type AvatarEngineJobState,
  type AvatarEngineJobStatus,
  type AvatarEngineProvider,
} from "./types";

/**
 * Shared implementation for every avatar engine microservice.
 *
 * All engines speak the same contract (see types.ts). Each provider file
 * just configures an instance: identity, capabilities, env var names, and
 * media validation. When the engine's API_URL env var is unset the provider
 * runs in SIMULATED mode — jobs advance queued → processing → completed on a
 * wall-clock timer with fake progress, so the app works with no GPU or keys.
 */

const SIM_PREFIX = "sim_";
const SIM_QUEUED_MS = 3_000;
const SIM_PROCESSING_MS = 12_000;
const SIM_FALLBACK_VIDEO =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4";

export interface HttpEngineConfig {
  id: string;
  name: string;
  mode: AvatarEngineProvider["mode"];
  supportsStillImage: boolean;
  supportsSourceVideo: boolean;
  supportsAudio: boolean;
  supportsRealtime: boolean;
  /** Env var holding the microservice base URL, e.g. "MUSETALK_API_URL". */
  apiUrlEnv: string;
  /** Env var holding an optional bearer token, e.g. "MUSETALK_API_KEY". */
  apiKeyEnv: string;
  /** Throws AvatarEngineError(400) when required media is missing. */
  validate: (input: AvatarEngineInput) => void;
}

interface WireJobResponse {
  jobId?: string;
  status?: string;
  progress?: number;
  outputVideoUrl?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class HttpAvatarEngine implements AvatarEngineProvider {
  readonly id: string;
  readonly name: string;
  readonly mode: AvatarEngineProvider["mode"];
  readonly supportsStillImage: boolean;
  readonly supportsSourceVideo: boolean;
  readonly supportsAudio: boolean;
  readonly supportsRealtime: boolean;

  constructor(private readonly config: HttpEngineConfig) {
    this.id = config.id;
    this.name = config.name;
    this.mode = config.mode;
    this.supportsStillImage = config.supportsStillImage;
    this.supportsSourceVideo = config.supportsSourceVideo;
    this.supportsAudio = config.supportsAudio;
    this.supportsRealtime = config.supportsRealtime;
  }

  isConfigured(): boolean {
    return Boolean(process.env[this.config.apiUrlEnv]);
  }

  validateInput(input: AvatarEngineInput): void {
    this.config.validate(input);
  }

  async createJob(input: AvatarEngineInput): Promise<AvatarEngineJob> {
    this.validateInput(input);

    if (!this.isConfigured()) {
      return this.createSimulatedJob(input);
    }

    const body = await this.request<WireJobResponse>("/jobs", {
      method: "POST",
      body: JSON.stringify({
        projectId: input.projectId,
        userId: input.userId,
        audioUrl: input.audioUrl,
        avatarImageUrl: input.avatarImageUrl ?? null,
        sourceVideoUrl: input.sourceVideoUrl ?? null,
        script: input.script,
        language: input.language ?? "en",
        aspectRatio: input.aspectRatio,
        emotion: input.emotion ?? "neutral",
        motionIntensity: input.motionIntensity ?? 0.5,
        options: input.engineOptions ?? {},
      }),
    });

    if (!body.jobId) {
      throw new AvatarEngineError(
        `${this.name} did not return a jobId`,
        this.id,
        502
      );
    }

    return {
      engineId: this.id,
      jobId: body.jobId,
      status: this.mapStatus(body.status),
      progress: body.progress ?? 0,
    };
  }

  async getJobStatus(jobId: string): Promise<AvatarEngineJobStatus> {
    if (jobId.startsWith(SIM_PREFIX)) {
      return this.getSimulatedStatus(jobId);
    }

    const body = await this.request<WireJobResponse>(
      `/jobs/${encodeURIComponent(jobId)}`,
      { method: "GET" }
    );

    const status = this.mapStatus(body.status);
    return {
      status,
      progress: body.progress ?? null,
      outputVideoUrl: status === "completed" ? body.outputVideoUrl ?? null : null,
      error: status === "failed" ? body.error ?? "Engine job failed" : null,
      metadata: body.metadata ?? null,
    };
  }

  /* ── real endpoint ─────────────────────────────────────────────────── */

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const baseUrl = process.env[this.config.apiUrlEnv]!.replace(/\/$/, "");
    const apiKey = process.env[this.config.apiKeyEnv];

    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: "no-store",
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { error?: string; message?: string };
        detail = body.error ?? body.message ?? detail;
      } catch {
        // keep statusText
      }
      throw new AvatarEngineError(
        `${this.name} request failed (${res.status}): ${detail}`,
        this.id,
        res.status
      );
    }

    return (await res.json()) as T;
  }

  private mapStatus(raw: string | undefined): AvatarEngineJobState {
    switch (raw) {
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "processing":
        return "processing";
      case "queued":
      default:
        return "queued";
    }
  }

  /* ── simulated (mock-mode) fallback ────────────────────────────────── */

  private createSimulatedJob(input: AvatarEngineInput): AvatarEngineJob {
    // Timestamp + echo-source are embedded so status is derivable with no
    // persisted state; the first "_"-free segment is the timestamp.
    const echo = encodeURIComponent(
      input.sourceVideoUrl ?? input.avatarImageUrl ?? ""
    );
    return {
      engineId: this.id,
      jobId: `${SIM_PREFIX}${Date.now()}_${echo}`,
      status: "queued",
      progress: 0,
      metadata: { simulated: true },
    };
  }

  private getSimulatedStatus(jobId: string): AvatarEngineJobStatus {
    const rest = jobId.slice(SIM_PREFIX.length);
    const sep = rest.indexOf("_");
    const createdAt = Number(sep === -1 ? rest : rest.slice(0, sep));
    if (!Number.isFinite(createdAt)) {
      throw new AvatarEngineError(
        `Malformed simulated job ID: ${jobId}`,
        this.id,
        400
      );
    }

    let echoUrl = "";
    if (sep !== -1) {
      try {
        echoUrl = decodeURIComponent(rest.slice(sep + 1));
      } catch {
        echoUrl = "";
      }
    }

    const elapsed = Date.now() - createdAt;
    if (elapsed < SIM_QUEUED_MS) {
      return { status: "queued", progress: 0, metadata: { simulated: true } };
    }
    const total = SIM_QUEUED_MS + SIM_PROCESSING_MS;
    if (elapsed < total) {
      const progress = Math.min(
        99,
        Math.round(((elapsed - SIM_QUEUED_MS) / SIM_PROCESSING_MS) * 100)
      );
      return { status: "processing", progress, metadata: { simulated: true } };
    }
    return {
      status: "completed",
      progress: 100,
      // Echo a video source back when we have one so the preview is relevant.
      outputVideoUrl:
        echoUrl && /\.(mp4|webm|mov)(\?|$)/i.test(echoUrl)
          ? echoUrl
          : SIM_FALLBACK_VIDEO,
      error: null,
      metadata: { simulated: true },
    };
  }
}
