import "server-only";

import {
  LipSyncProviderError,
  type LipSyncInput,
  type LipSyncJob,
  type LipSyncJobStatus,
  type LipSyncProvider,
  type LipSyncStatus,
} from "../types";

const QUEUE_BASE_URL = "https://queue.fal.run";

/* ── fal wire types (subset of fields we consume) ────────────────────── */

interface FalQueueSubmitResponse {
  request_id?: string;
}

interface FalQueueStatusResponse {
  status?: string;
  error?: string | { message?: string } | null;
}

interface FalLipSyncResult {
  video?: { url?: string } | null;
  url?: string;
  error?: string | { message?: string } | null;
}

/**
 * fal.ai implementation of the LipSyncProvider interface.
 *
 * Uses a queue-based model (MuseTalk by default) that requires an actual
 * talking-head source video plus caller-provided audio — it cannot animate
 * a still avatar image.
 */
export class FalLipSyncProvider implements LipSyncProvider {
  readonly name = "fal";

  private readonly model: string;

  constructor(private readonly falKey: string) {
    if (!falKey) {
      throw new LipSyncProviderError("FAL_KEY is not set", this.name);
    }
    this.model = process.env.FAL_LIPSYNC_MODEL ?? "fal-ai/musetalk";
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Key ${this.falKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body?.detail ?? body?.message ?? detail;
      } catch {
        // non-JSON error body; keep statusText
      }
      throw new LipSyncProviderError(
        `fal request failed (${res.status}): ${detail}`,
        this.name,
        res.status
      );
    }

    return (await res.json()) as T;
  }

  async createLipSyncJob(input: LipSyncInput): Promise<LipSyncJob> {
    const source = input.sourceVideoUrl;
    if (!source) {
      throw new LipSyncProviderError(
        "fal MuseTalk requires a talking-head source video — upload one or choose another engine.",
        this.name,
        400
      );
    }

    const data = await this.request<FalQueueSubmitResponse>(
      `${QUEUE_BASE_URL}/${this.model}`,
      {
        method: "POST",
        body: JSON.stringify({
          source_video_url: source,
          audio_url: input.audioUrl,
        }),
      }
    );

    if (!data.request_id) {
      throw new LipSyncProviderError(
        "fal did not return a request_id",
        this.name
      );
    }

    return { provider: this.name, jobId: data.request_id, status: "pending" };
  }

  async getLipSyncStatus(jobId: string): Promise<LipSyncJobStatus> {
    const statusData = await this.request<FalQueueStatusResponse>(
      `${QUEUE_BASE_URL}/${this.model}/requests/${encodeURIComponent(jobId)}/status`
    );

    const errorMessage = (err: FalQueueStatusResponse["error"]): string =>
      typeof err === "string" ? err : err?.message ?? "Render failed";

    switch (statusData.status) {
      case "IN_QUEUE":
        return { status: "pending", outputVideoUrl: null, error: null };
      case "IN_PROGRESS":
        return { status: "processing", outputVideoUrl: null, error: null };
      case "COMPLETED": {
        const result = await this.request<FalLipSyncResult>(
          `${QUEUE_BASE_URL}/${this.model}/requests/${encodeURIComponent(jobId)}`
        );

        const outputVideoUrl = result.video?.url ?? result.url ?? null;
        if (!outputVideoUrl) {
          return {
            status: "failed",
            outputVideoUrl: null,
            error: result.error
              ? errorMessage(result.error)
              : "fal completed but returned no video URL",
          };
        }

        return { status: "completed", outputVideoUrl, error: null };
      }
      default: {
        const status: LipSyncStatus = "failed";
        return {
          status,
          outputVideoUrl: null,
          error: statusData.error
            ? errorMessage(statusData.error)
            : `Unexpected fal status: ${statusData.status ?? "unknown"}`,
        };
      }
    }
  }
}
