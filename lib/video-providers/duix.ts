import "server-only";

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

/**
 * EXPERIMENTAL: Duix-Avatar provider (https://github.com/duixcom/Duix-Avatar).
 *
 * Duix-Avatar is an open-source, self-hosted digital-human stack deployed via
 * Docker (requires an NVIDIA GPU). Unlike HeyGen, avatars and voices are
 * models you train locally, so there is no cloud catalog to list — you
 * declare your trained models via env vars:
 *
 *   VIDEO_PROVIDER=duix
 *   DUIX_VIDEO_API_URL=http://127.0.0.1:8383    # video synthesis service
 *   DUIX_TTS_API_URL=http://127.0.0.1:18180     # audio synthesis service
 *   DUIX_AVATARS='[{"id":"<model-video-path-or-id>","name":"My Avatar"}]'
 *   DUIX_VOICES='[{"id":"<speaker-uuid>","name":"My Voice","language":"English"}]'
 *
 * Endpoint shapes follow the public Duix-Avatar docs (TTS `/v1/invoke`,
 * video `/easy/submit` + `/easy/query`). Duix deployments vary by version —
 * verify request/response fields against your running instance before
 * production use.
 */
export class DuixProvider implements VideoProvider {
  readonly name = "duix";

  private readonly videoApiUrl: string;
  private readonly ttsApiUrl: string;

  constructor() {
    this.videoApiUrl = (
      process.env.DUIX_VIDEO_API_URL ?? "http://127.0.0.1:8383"
    ).replace(/\/$/, "");
    this.ttsApiUrl = (
      process.env.DUIX_TTS_API_URL ?? "http://127.0.0.1:18180"
    ).replace(/\/$/, "");
  }

  private parseCatalog<T>(envVar: string): T[] {
    const raw = process.env[envVar];
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      throw new VideoProviderError(
        `${envVar} is not valid JSON`,
        this.name,
        500
      );
    }
  }

  async listAvatars(): Promise<Avatar[]> {
    const configured =
      this.parseCatalog<{ id: string; name: string; previewImageUrl?: string }>(
        "DUIX_AVATARS"
      );
    if (configured.length === 0) {
      throw new VideoProviderError(
        "No Duix avatars configured. Set DUIX_AVATARS to a JSON array of your locally trained models.",
        this.name,
        500
      );
    }
    return configured.map((a) => ({
      id: a.id,
      name: a.name,
      previewImageUrl: a.previewImageUrl ?? null,
      gender: null,
    }));
  }

  async listVoices(): Promise<Voice[]> {
    const configured = this.parseCatalog<{
      id: string;
      name: string;
      language?: string;
    }>("DUIX_VOICES");
    if (configured.length === 0) {
      throw new VideoProviderError(
        "No Duix voices configured. Set DUIX_VOICES to a JSON array of your cloned speaker UUIDs.",
        this.name,
        500
      );
    }
    return configured.map((v) => ({
      id: v.id,
      name: v.name,
      language: v.language ?? "English",
      gender: null,
      previewAudioUrl: null,
    }));
  }

  async createVideo(input: CreateVideoInput): Promise<CreateVideoResult> {
    // 1) Synthesize speech from the script with the cloned voice.
    const ttsRes = await fetch(`${this.ttsApiUrl}/v1/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speaker: input.voiceId,
        text: input.script,
        format: "wav",
      }),
      cache: "no-store",
    });
    if (!ttsRes.ok) {
      throw new VideoProviderError(
        `Duix TTS failed (${ttsRes.status})`,
        this.name,
        ttsRes.status
      );
    }
    const tts = (await ttsRes.json()) as { audio_url?: string; url?: string };
    const audioUrl = tts.audio_url ?? tts.url;
    if (!audioUrl) {
      throw new VideoProviderError(
        "Duix TTS did not return an audio URL",
        this.name
      );
    }

    // 2) Submit the video synthesis job. `code` is our job handle.
    const code = crypto.randomUUID();
    const submitRes = await fetch(`${this.videoApiUrl}/easy/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_url: audioUrl,
        video_url: input.avatarId,
        code,
        chaofen: 0,
        watermark_switch: 0,
        pn: 1,
      }),
      cache: "no-store",
    });
    if (!submitRes.ok) {
      throw new VideoProviderError(
        `Duix video submit failed (${submitRes.status})`,
        this.name,
        submitRes.status
      );
    }

    return { providerVideoId: code };
  }

  async getVideoStatus(providerVideoId: string): Promise<VideoStatusResult> {
    const res = await fetch(
      `${this.videoApiUrl}/easy/query?code=${encodeURIComponent(providerVideoId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      throw new VideoProviderError(
        `Duix status query failed (${res.status})`,
        this.name,
        res.status
      );
    }
    const body = (await res.json()) as {
      data?: { status?: number | string; result?: string; msg?: string };
    };
    const d = body.data ?? {};

    const status = this.mapStatus(d.status);
    return {
      status,
      videoUrl: status === "completed" ? d.result ?? null : null,
      thumbnailUrl: null,
      error: status === "failed" ? d.msg ?? "Render failed" : null,
    };
  }

  private mapStatus(raw: number | string | undefined): RenderStatus {
    // Duix `/easy/query` reports numeric progress states:
    // 1 = waiting/in progress, 2 = completed, 3 = failed.
    switch (String(raw)) {
      case "2":
      case "completed":
        return "completed";
      case "3":
      case "failed":
        return "failed";
      case "1":
      case "processing":
        return "processing";
      default:
        return "pending";
    }
  }
}
