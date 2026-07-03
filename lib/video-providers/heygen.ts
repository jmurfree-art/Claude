import "server-only";

import { ASPECT_RATIO_DIMENSIONS } from "@/lib/constants";
import {
  VideoProviderError,
  type Avatar,
  type CreateVideoInput,
  type CreateVideoResult,
  type RenderStatus,
  type VideoProvider,
  type VideoStatusResult,
  type Voice,
} from "./types";

const BASE_URL = "https://api.heygen.com";

/* ── HeyGen wire types (subset of fields we consume) ─────────────────── */

interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  preview_image_url?: string;
  gender?: string;
}

interface HeyGenVoice {
  voice_id: string;
  name?: string;
  display_name?: string;
  language?: string;
  gender?: string;
  preview_audio?: string;
}

interface HeyGenVideoStatus {
  status?: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
  error?: { message?: string } | string | null;
}

/**
 * HeyGen implementation of the VideoProvider interface.
 *
 * All calls run server-side only (`server-only` import above enforces this
 * at build time) so the API key never reaches the browser.
 */
export class HeyGenProvider implements VideoProvider {
  readonly name = "heygen";

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new VideoProviderError("HEYGEN_API_KEY is not set", this.name);
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
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
      throw new VideoProviderError(
        `HeyGen request failed (${res.status}): ${detail}`,
        this.name,
        res.status
      );
    }

    const body = (await res.json()) as { data?: T; error?: unknown };
    return (body.data ?? body) as T;
  }

  async listAvatars(): Promise<Avatar[]> {
    const data = await this.request<{ avatars?: HeyGenAvatar[] }>(
      "/v2/avatars"
    );
    return (data.avatars ?? []).map((a) => ({
      id: a.avatar_id,
      name: a.avatar_name,
      previewImageUrl: a.preview_image_url ?? null,
      gender: a.gender ?? null,
    }));
  }

  async listVoices(): Promise<Voice[]> {
    const data = await this.request<{ voices?: HeyGenVoice[] }>("/v2/voices");
    return (data.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.display_name ?? v.name ?? v.voice_id,
      language: v.language ?? "Unknown",
      gender: v.gender ?? null,
      previewAudioUrl: v.preview_audio ?? null,
    }));
  }

  async createVideo(input: CreateVideoInput): Promise<CreateVideoResult> {
    const dimension = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

    const data = await this.request<{ video_id?: string }>(
      "/v2/video/generate",
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          caption: false,
          dimension,
          video_inputs: [
            {
              character: {
                type: "avatar",
                avatar_id: input.avatarId,
                avatar_style: "normal",
              },
              voice: {
                type: "text",
                input_text: input.script,
                voice_id: input.voiceId,
              },
              background: {
                type: "color",
                value: input.backgroundColor,
              },
            },
          ],
        }),
      }
    );

    if (!data.video_id) {
      throw new VideoProviderError(
        "HeyGen did not return a video_id",
        this.name
      );
    }
    return { providerVideoId: data.video_id };
  }

  async getVideoStatus(providerVideoId: string): Promise<VideoStatusResult> {
    const data = await this.request<HeyGenVideoStatus>(
      `/v1/video_status.get?video_id=${encodeURIComponent(providerVideoId)}`
    );

    const status = this.mapStatus(data.status);
    const errorMessage =
      typeof data.error === "string"
        ? data.error
        : data.error?.message ?? null;

    return {
      status,
      videoUrl: status === "completed" ? data.video_url ?? null : null,
      thumbnailUrl: data.thumbnail_url ?? null,
      error: status === "failed" ? errorMessage ?? "Render failed" : null,
    };
  }

  private mapStatus(raw: string | undefined): RenderStatus {
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
