/**
 * Provider-agnostic contracts for AI avatar video generation.
 *
 * The app talks only to the `VideoProvider` interface. HeyGen is the first
 * implementation; swapping to another vendor means adding a new class that
 * satisfies this interface and registering it in `index.ts`.
 */

export type AspectRatio = "16:9" | "9:16" | "1:1";

export interface Avatar {
  id: string;
  name: string;
  previewImageUrl: string | null;
  gender: string | null;
}

export interface Voice {
  id: string;
  name: string;
  /** Human-readable language label as reported by the provider, e.g. "English". */
  language: string;
  gender: string | null;
  previewAudioUrl: string | null;
}

export interface CreateVideoInput {
  title: string;
  script: string;
  avatarId: string;
  voiceId: string;
  /** Solid background color (hex), e.g. "#FFFFFF". */
  backgroundColor: string;
  aspectRatio: AspectRatio;
}

export interface CreateVideoResult {
  /** The provider's ID for the render job; stored as `provider_video_id`. */
  providerVideoId: string;
}

export type RenderStatus = "pending" | "processing" | "completed" | "failed";

export interface VideoStatusResult {
  status: RenderStatus;
  /** Download/stream URL of the final MP4. Only set when status is "completed". */
  videoUrl: string | null;
  thumbnailUrl: string | null;
  /** Provider error message. Only set when status is "failed". */
  error: string | null;
}

export interface VideoProvider {
  /** Machine name stored on projects, e.g. "heygen" or "mock". */
  readonly name: string;
  listAvatars(): Promise<Avatar[]>;
  listVoices(): Promise<Voice[]>;
  createVideo(input: CreateVideoInput): Promise<CreateVideoResult>;
  getVideoStatus(providerVideoId: string): Promise<VideoStatusResult>;
}

export class VideoProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "VideoProviderError";
  }
}
