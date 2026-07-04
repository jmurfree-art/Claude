import "server-only";

import { ASPECT_RATIO_DIMENSIONS } from "@/lib/constants";
import {
  LipSyncProviderError,
  type LipSyncInput,
  type LipSyncJob,
  type LipSyncJobStatus,
  type LipSyncProvider,
  type LipSyncStatus,
} from "../types";

const BASE_URL = "https://api.heygen.com";
const UPLOAD_URL = "https://upload.heygen.com/v1/talking_photo";

/* ── HeyGen wire types (subset of fields we consume) ─────────────────── */

interface HeyGenVideoGenerateResponse {
  video_id?: string;
}

interface HeyGenTalkingPhotoResponse {
  talking_photo_id?: string;
}

interface HeyGenVideoStatus {
  status?: string;
  video_url?: string | null;
  error?: { message?: string } | string | null;
}

/**
 * HeyGen implementation of the LipSyncProvider interface.
 *
 * Lip-syncs caller-provided audio onto either an uploaded still image
 * (via HeyGen's "talking photo" upload endpoint) or a stock avatar. HeyGen's
 * public API has no source-video re-lip-sync capability.
 */
export class HeyGenLipSyncProvider implements LipSyncProvider {
  readonly name = "heygen";

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new LipSyncProviderError("HEYGEN_API_KEY is not set", this.name);
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    baseUrl: string = BASE_URL
  ): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "X-Api-Key": this.apiKey,
        ...init.headers,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body?.error?.message ?? body?.message ?? detail;
      } catch {
        // non-JSON error body; keep statusText
      }
      throw new LipSyncProviderError(
        `HeyGen request failed (${res.status}): ${detail}`,
        this.name,
        res.status
      );
    }

    const body = (await res.json()) as { data?: T; error?: unknown };
    return (body.data ?? body) as T;
  }

  private async uploadTalkingPhoto(imageUrl: string): Promise<string> {
    const imageRes = await fetch(imageUrl, { cache: "no-store" });
    if (!imageRes.ok) {
      throw new LipSyncProviderError(
        `Failed to fetch avatar image for HeyGen upload (${imageRes.status})`,
        this.name,
        400
      );
    }
    const contentType =
      imageRes.headers.get("content-type") ?? "image/jpeg";
    const bytes = await imageRes.arrayBuffer();

    const data = await this.request<HeyGenTalkingPhotoResponse>(
      "",
      {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: bytes,
      },
      UPLOAD_URL
    );

    if (!data.talking_photo_id) {
      throw new LipSyncProviderError(
        "HeyGen did not return a talking_photo_id",
        this.name
      );
    }
    return data.talking_photo_id;
  }

  async createLipSyncJob(input: LipSyncInput): Promise<LipSyncJob> {
    let character: Record<string, unknown>;

    if (input.avatarImageUrl) {
      const talkingPhotoId = await this.uploadTalkingPhoto(
        input.avatarImageUrl
      );
      character = {
        type: "talking_photo",
        talking_photo_id: talkingPhotoId,
      };
    } else if (input.sourceVideoUrl) {
      throw new LipSyncProviderError(
        "HeyGen lip-sync needs a still image or stock avatar, not a source video — provide avatarImageUrl or choose a different engine.",
        this.name,
        400
      );
    } else {
      const avatarId =
        (input.providerOptions?.avatarId as string | undefined) ??
        process.env.HEYGEN_DEFAULT_AVATAR_ID ??
        "Daisy-inskirt-20220818";
      character = {
        type: "avatar",
        avatar_id: avatarId,
        avatar_style: "normal",
      };
    }

    const dimension = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

    const data = await this.request<HeyGenVideoGenerateResponse>(
      "/v2/video/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `lipsync-${input.projectId}`,
          caption: false,
          dimension,
          video_inputs: [
            {
              character,
              voice: {
                type: "audio",
                audio_url: input.audioUrl,
              },
              background: {
                type: "color",
                value: "#FFFFFF",
              },
            },
          ],
        }),
      }
    );

    if (!data.video_id) {
      throw new LipSyncProviderError(
        "HeyGen did not return a video_id",
        this.name
      );
    }

    return { provider: this.name, jobId: data.video_id, status: "pending" };
  }

  async getLipSyncStatus(jobId: string): Promise<LipSyncJobStatus> {
    const data = await this.request<HeyGenVideoStatus>(
      `/v1/video_status.get?video_id=${encodeURIComponent(jobId)}`
    );

    const status = this.mapStatus(data.status);
    const errorMessage =
      typeof data.error === "string" ? data.error : data.error?.message ?? null;

    return {
      status,
      outputVideoUrl: status === "completed" ? data.video_url ?? null : null,
      error: status === "failed" ? errorMessage ?? "Render failed" : null,
    };
  }

  private mapStatus(raw: string | undefined): LipSyncStatus {
    switch (raw) {
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "processing":
        return "processing";
      case "pending":
      case "waiting":
      default:
        return "pending";
    }
  }
}
