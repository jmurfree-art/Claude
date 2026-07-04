import "server-only";

import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { ASPECT_RATIO_DIMENSIONS } from "@/lib/constants";
import { synthesizeSpeechToBuffer } from "@/lib/tts";
import {
  VideoProviderError,
  type Avatar,
  type CreateVideoInput,
  type CreateVideoResult,
  type VideoProvider,
  type VideoStatusResult,
  type Voice,
} from "./types";

const execFile = promisify(execFileCallback);

/** Directory where synthesized audio, avatar stills, and rendered MP4s live. */
const RENDER_DIR =
  process.env.LOCAL_RENDER_DIR ?? path.join(process.cwd(), ".local-renders");

/** Path to the ffmpeg binary. Overridable for non-standard installs. */
const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "ffmpeg";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Hardcoded catalogs (no external avatar/voice vendor required) ──────── */

const AVATARS: Avatar[] = [
  {
    id: "local-ava-nova",
    name: "Nova",
    previewImageUrl:
      "https://api.dicebear.com/9.x/notionists/svg?seed=Nova&backgroundColor=e8ecf1",
    gender: "female",
  },
  {
    id: "local-ava-atlas",
    name: "Atlas",
    previewImageUrl:
      "https://api.dicebear.com/9.x/notionists/svg?seed=Atlas&backgroundColor=e8ecf1",
    gender: "male",
  },
  {
    id: "local-ava-luna",
    name: "Luna",
    previewImageUrl:
      "https://api.dicebear.com/9.x/notionists/svg?seed=Luna&backgroundColor=e8ecf1",
    gender: "female",
  },
  {
    id: "local-ava-orion",
    name: "Orion",
    previewImageUrl:
      "https://api.dicebear.com/9.x/notionists/svg?seed=Orion&backgroundColor=e8ecf1",
    gender: "male",
  },
  {
    id: "local-ava-sage",
    name: "Sage",
    previewImageUrl:
      "https://api.dicebear.com/9.x/notionists/svg?seed=Sage&backgroundColor=e8ecf1",
    gender: "female",
  },
  {
    id: "local-ava-remy",
    name: "Remy",
    previewImageUrl:
      "https://api.dicebear.com/9.x/notionists/svg?seed=Remy&backgroundColor=e8ecf1",
    gender: "male",
  },
];

const VOICES: Voice[] = [
  {
    id: "en-US-AriaNeural",
    name: "Aria — Natural (US)",
    language: "English",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "en-US-GuyNeural",
    name: "Guy — Natural (US)",
    language: "English",
    gender: "male",
    previewAudioUrl: null,
  },
  {
    id: "es-ES-ElviraNeural",
    name: "Elvira — Natural (Spain)",
    language: "Spanish",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "es-MX-JorgeNeural",
    name: "Jorge — Natural (Mexico)",
    language: "Spanish",
    gender: "male",
    previewAudioUrl: null,
  },
  {
    id: "fr-FR-DeniseNeural",
    name: "Denise — Natural (France)",
    language: "French",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "de-DE-KatjaNeural",
    name: "Katja — Natural (Germany)",
    language: "German",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "it-IT-ElsaNeural",
    name: "Elsa — Natural (Italy)",
    language: "Italian",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "pt-BR-FranciscaNeural",
    name: "Francisca — Natural (Brazil)",
    language: "Portuguese",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "nl-NL-ColetteNeural",
    name: "Colette — Natural (Netherlands)",
    language: "Dutch",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "pl-PL-ZofiaNeural",
    name: "Zofia — Natural (Poland)",
    language: "Polish",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "hi-IN-SwaraNeural",
    name: "Swara — Natural (India)",
    language: "Hindi",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "ja-JP-NanamiNeural",
    name: "Nanami — Natural (Japan)",
    language: "Japanese",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "ko-KR-SunHiNeural",
    name: "SunHi — Natural (Korea)",
    language: "Korean",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "zh-CN-XiaoxiaoNeural",
    name: "Xiaoxiao — Natural (China)",
    language: "Chinese",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "ar-SA-ZariyahNeural",
    name: "Zariyah — Natural (Saudi Arabia)",
    language: "Arabic",
    gender: "female",
    previewAudioUrl: null,
  },
  {
    id: "tr-TR-EmelNeural",
    name: "Emel — Natural (Turkey)",
    language: "Turkish",
    gender: "female",
    previewAudioUrl: null,
  },
];

/**
 * Fully local, zero-cost implementation of the `VideoProvider` interface.
 *
 * - Speech is synthesized with Microsoft Edge's free neural TTS (via the
 *   `msedge-tts` package, which speaks Edge's public Read Aloud WebSocket
 *   endpoint — no API key required).
 * - Avatar stills come from the free, keyless DiceBear avatar API.
 * - Composition (background color + avatar overlay + audio) is done with
 *   the system `ffmpeg` binary, invoked as a subprocess.
 *
 * Renders happen out-of-band: `createVideo` kicks off `render()` without
 * awaiting it and returns immediately. Progress is tracked purely via the
 * filesystem (`<id>.mp4` = done, `<id>.err` = failed, neither = pending).
 */
export class LocalProvider implements VideoProvider {
  readonly name = "local";

  async listAvatars(): Promise<Avatar[]> {
    return AVATARS;
  }

  async listVoices(): Promise<Voice[]> {
    return VOICES;
  }

  async createVideo(input: CreateVideoInput): Promise<CreateVideoResult> {
    const avatar = AVATARS.find((a) => a.id === input.avatarId);
    if (!avatar) {
      throw new VideoProviderError(
        `Unknown avatarId: ${input.avatarId}`,
        this.name,
        400
      );
    }

    const voice = VOICES.find((v) => v.id === input.voiceId);
    if (!voice) {
      throw new VideoProviderError(
        `Unknown voiceId: ${input.voiceId}`,
        this.name,
        400
      );
    }

    await mkdir(RENDER_DIR, { recursive: true });

    const id = randomUUID();

    // Fire-and-forget: the render runs in the background. Any failure is
    // persisted to `<id>.err` so a later `getVideoStatus` call can surface it.
    void this.render(id, input).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await writeFile(path.join(RENDER_DIR, `${id}.err`), message, "utf8");
      } catch {
        // Best effort — if we can't even write the error file there is
        // nothing more we can do here.
      }
    });

    return { providerVideoId: id };
  }

  async getVideoStatus(providerVideoId: string): Promise<VideoStatusResult> {
    if (!UUID_REGEX.test(providerVideoId)) {
      throw new VideoProviderError(
        `Invalid providerVideoId: ${providerVideoId}`,
        this.name,
        400
      );
    }

    const mp4Path = path.join(RENDER_DIR, `${providerVideoId}.mp4`);
    const errPath = path.join(RENDER_DIR, `${providerVideoId}.err`);

    if (await this.pathExists(mp4Path)) {
      return {
        status: "completed",
        videoUrl: `/api/local-video/${providerVideoId}`,
        thumbnailUrl: null,
        error: null,
      };
    }

    if (await this.pathExists(errPath)) {
      let message = "Render failed";
      try {
        const contents = await readFile(errPath, "utf8");
        if (contents.trim()) {
          message = contents;
        }
      } catch {
        // Fall back to the generic message above.
      }
      return {
        status: "failed",
        videoUrl: null,
        thumbnailUrl: null,
        error: message,
      };
    }

    return {
      status: "processing",
      videoUrl: null,
      thumbnailUrl: null,
      error: null,
    };
  }

  /* ── Render pipeline ──────────────────────────────────────────────────── */

  private async render(id: string, input: CreateVideoInput): Promise<void> {
    await mkdir(RENDER_DIR, { recursive: true });

    const mp3Path = path.join(RENDER_DIR, `${id}.mp3`);
    const pngPath = path.join(RENDER_DIR, `${id}.png`);
    const tmpMp4Path = path.join(RENDER_DIR, `${id}.tmp.mp4`);
    const mp4Path = path.join(RENDER_DIR, `${id}.mp4`);

    try {
      await this.synthesizeSpeech(input.voiceId, input.script, mp3Path);

      const hasAvatar = await this.fetchAvatarStill(input.avatarId, pngPath);

      const { width, height } = ASPECT_RATIO_DIMENSIONS[input.aspectRatio];
      const args = this.buildFfmpegArgs({
        width,
        height,
        color: this.toFfmpegColor(input.backgroundColor),
        mp3Path,
        pngPath: hasAvatar ? pngPath : null,
        outPath: tmpMp4Path,
      });

      await execFile(FFMPEG_PATH, args);

      // Rename only after ffmpeg fully succeeds, so a status check never
      // observes a partially written `.mp4`.
      await rename(tmpMp4Path, mp4Path);
    } finally {
      // Best-effort cleanup of intermediates; never fails the render.
      await Promise.allSettled([
        rm(mp3Path, { force: true }),
        rm(pngPath, { force: true }),
        rm(tmpMp4Path, { force: true }),
      ]);
    }
  }

  /** Synthesizes `script` with Edge neural TTS and writes raw MP3 to `outPath`. */
  private async synthesizeSpeech(
    voiceId: string,
    script: string,
    outPath: string
  ): Promise<void> {
    const audio = await synthesizeSpeechToBuffer(voiceId, script);
    await writeFile(outPath, audio);
  }

  /**
   * Downloads a free, keyless DiceBear avatar still for the given avatar id
   * and writes it to `outPath`. Returns `false` (without throwing) if the
   * fetch fails, so the caller can fall back to a plain background render.
   */
  private async fetchAvatarStill(
    avatarId: string,
    outPath: string
  ): Promise<boolean> {
    const avatar = AVATARS.find((a) => a.id === avatarId);
    const seed = avatar?.name ?? avatarId;
    const url = `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(seed)}&size=512&backgroundColor=transparent`;

    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(outPath, buffer);
      return true;
    } catch {
      return false;
    }
  }

  /** Converts a "#RRGGBB" string into the "0xRRGGBB" form ffmpeg's lavfi expects. */
  private toFfmpegColor(hex: string): string {
    return `0x${hex.replace(/^#/, "")}`;
  }

  private buildFfmpegArgs(opts: {
    width: number;
    height: number;
    color: string;
    mp3Path: string;
    pngPath: string | null;
    outPath: string;
  }): string[] {
    const { width, height, color, mp3Path, pngPath, outPath } = opts;
    const size = `${width}x${height}`;
    const background = `color=c=${color}:size=${size}:rate=25`;

    if (pngPath) {
      const avatarHeight = Math.round(height * 0.8);
      return [
        "-f",
        "lavfi",
        "-i",
        background,
        "-loop",
        "1",
        "-i",
        pngPath,
        "-i",
        mp3Path,
        "-filter_complex",
        `[1:v]scale=-2:${avatarHeight}[av];[0:v][av]overlay=(main_w-overlay_w)/2:main_h-overlay_h`,
        "-map",
        "2:a",
        "-shortest",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-y",
        outPath,
      ];
    }

    return [
      "-f",
      "lavfi",
      "-i",
      background,
      "-i",
      mp3Path,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-y",
      outPath,
    ];
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  }
}
