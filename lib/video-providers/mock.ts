import "server-only";

import {
  VideoProviderError,
  type Avatar,
  type CreateVideoInput,
  type CreateVideoResult,
  type VideoProvider,
  type VideoStatusResult,
  type Voice,
} from "./types";

/** Wall-clock time a mock render spends in each phase. */
const PENDING_MS = 4_000;
const PROCESSING_MS = 12_000;

const SAMPLE_VIDEO_URL =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4";

const MOCK_AVATARS: Avatar[] = [
  { id: "mock-ava-nora", name: "Nora", gender: "female" },
  { id: "mock-ava-dev", name: "Dev", gender: "male" },
  { id: "mock-ava-maya", name: "Maya", gender: "female" },
  { id: "mock-ava-theo", name: "Theo", gender: "male" },
  { id: "mock-ava-iris", name: "Iris", gender: "female" },
  { id: "mock-ava-kai", name: "Kai", gender: "male" },
].map((a) => ({
  ...a,
  previewImageUrl: `https://api.dicebear.com/9.x/notionists/svg?seed=${a.name}&backgroundColor=e8ecf1`,
}));

const MOCK_VOICES: Voice[] = [
  { id: "mock-voice-en-f", name: "Ava — Warm", language: "English", gender: "female" },
  { id: "mock-voice-en-m", name: "Marcus — Confident", language: "English", gender: "male" },
  { id: "mock-voice-es-f", name: "Lucía — Clara", language: "Spanish", gender: "female" },
  { id: "mock-voice-es-m", name: "Diego — Cálido", language: "Spanish", gender: "male" },
  { id: "mock-voice-fr-f", name: "Élodie — Douce", language: "French", gender: "female" },
  { id: "mock-voice-de-m", name: "Lukas — Klar", language: "German", gender: "male" },
  { id: "mock-voice-it-f", name: "Giulia — Vivace", language: "Italian", gender: "female" },
  { id: "mock-voice-pt-f", name: "Beatriz — Suave", language: "Portuguese", gender: "female" },
  { id: "mock-voice-hi-m", name: "Arjun — Steady", language: "Hindi", gender: "male" },
  { id: "mock-voice-ja-f", name: "Yui — Bright", language: "Japanese", gender: "female" },
  { id: "mock-voice-ko-m", name: "Minjun — Calm", language: "Korean", gender: "male" },
  { id: "mock-voice-zh-f", name: "Mei — Clear", language: "Chinese", gender: "female" },
].map((v) => ({ ...v, previewAudioUrl: null }));

/**
 * Development provider used when HEYGEN_API_KEY is missing.
 *
 * Simulates the full render lifecycle without any external API: a created
 * "video" moves pending → processing → completed on a timer encoded in the
 * mock video ID, then resolves to a public-domain sample MP4.
 */
export class MockProvider implements VideoProvider {
  readonly name = "mock";

  async listAvatars(): Promise<Avatar[]> {
    return MOCK_AVATARS;
  }

  async listVoices(): Promise<Voice[]> {
    return MOCK_VOICES;
  }

  async createVideo(input: CreateVideoInput): Promise<CreateVideoResult> {
    const avatarOk = MOCK_AVATARS.some((a) => a.id === input.avatarId);
    const voiceOk = MOCK_VOICES.some((v) => v.id === input.voiceId);
    if (!avatarOk || !voiceOk) {
      throw new VideoProviderError(
        "Unknown avatar or voice ID for mock provider",
        this.name,
        400
      );
    }
    // The creation timestamp is embedded in the ID so status can be derived
    // statelessly (the container may restart between poll requests).
    return { providerVideoId: `mock_${Date.now()}` };
  }

  async getVideoStatus(providerVideoId: string): Promise<VideoStatusResult> {
    const createdAt = Number(providerVideoId.replace("mock_", ""));
    if (!Number.isFinite(createdAt)) {
      throw new VideoProviderError(
        `Malformed mock video ID: ${providerVideoId}`,
        this.name,
        400
      );
    }

    const elapsed = Date.now() - createdAt;
    if (elapsed < PENDING_MS) {
      return { status: "pending", videoUrl: null, thumbnailUrl: null, error: null };
    }
    if (elapsed < PENDING_MS + PROCESSING_MS) {
      return { status: "processing", videoUrl: null, thumbnailUrl: null, error: null };
    }
    return {
      status: "completed",
      videoUrl: SAMPLE_VIDEO_URL,
      thumbnailUrl: null,
      error: null,
    };
  }
}
