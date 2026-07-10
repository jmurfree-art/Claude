import "server-only";

import {
  LipSyncProviderError,
  type LipSyncInput,
  type LipSyncJob,
  type LipSyncJobStatus,
  type LipSyncProvider,
  type LipSyncStatus,
} from "../types";

const BASE_URL = "https://api.replicate.com/v1";

/* ── Replicate wire types (subset of fields we consume) ──────────────── */

interface ReplicatePredictionResponse {
  id?: string;
  status?: string;
  output?: string | string[] | null;
  error?: string | null;
}

/**
 * Replicate implementation of the LipSyncProvider interface.
 *
 * Runs a Wav2Lip-style model (version pinned via REPLICATE_LIPSYNC_VERSION)
 * against a face source — a source video if provided, otherwise a still
 * avatar image — combined with caller-provided audio.
 */
export class ReplicateLipSyncProvider implements LipSyncProvider {
  readonly name = "replicate";

  constructor(private readonly apiToken: string) {
    if (!apiToken) {
      throw new LipSyncProviderError(
        "REPLICATE_API_TOKEN is not set",
        this.name
      );
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body?.detail ?? body?.error ?? body?.message ?? detail;
      } catch {
        // non-JSON error body; keep statusText
      }
      throw new LipSyncProviderError(
        `Replicate request failed (${res.status}): ${detail}`,
        this.name,
        res.status
      );
    }

    return (await res.json()) as T;
  }

  async createLipSyncJob(input: LipSyncInput): Promise<LipSyncJob> {
    const version = process.env.REPLICATE_LIPSYNC_VERSION;
    if (!version) {
      throw new LipSyncProviderError(
        "REPLICATE_LIPSYNC_VERSION is not configured — set it to a Replicate version hash for a Wav2Lip-style model (see README for how to pick one).",
        this.name,
        400
      );
    }

    const face = input.sourceVideoUrl ?? input.avatarImageUrl;
    if (!face) {
      throw new LipSyncProviderError(
        "Replicate lip-sync requires a sourceVideoUrl or avatarImageUrl.",
        this.name,
        400
      );
    }

    const data = await this.request<ReplicatePredictionResponse>(
      "/predictions",
      {
        method: "POST",
        body: JSON.stringify({
          version,
          input: {
            face,
            audio: input.audioUrl,
          },
        }),
      }
    );

    if (!data.id) {
      throw new LipSyncProviderError(
        "Replicate did not return a prediction id",
        this.name
      );
    }

    return {
      provider: this.name,
      jobId: data.id,
      status: this.mapStatus(data.status),
    };
  }

  async getLipSyncStatus(jobId: string): Promise<LipSyncJobStatus> {
    const data = await this.request<ReplicatePredictionResponse>(
      `/predictions/${encodeURIComponent(jobId)}`
    );

    const status = this.mapStatus(data.status);

    let outputVideoUrl: string | null = null;
    if (status === "completed") {
      if (typeof data.output === "string") {
        outputVideoUrl = data.output;
      } else if (Array.isArray(data.output) && data.output.length > 0) {
        outputVideoUrl = data.output[data.output.length - 1];
      }
    }

    return {
      status,
      outputVideoUrl,
      error: status === "failed" ? data.error ?? "Render failed" : null,
    };
  }

  private mapStatus(raw: string | undefined): LipSyncStatus {
    switch (raw) {
      case "succeeded":
        return "completed";
      case "failed":
      case "canceled":
        return "failed";
      case "processing":
        return "processing";
      case "starting":
      default:
        return "pending";
    }
  }
}
