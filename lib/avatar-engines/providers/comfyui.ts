import "server-only";

import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  AvatarEngineError,
  type AvatarEngineInput,
  type AvatarEngineJob,
  type AvatarEngineJobStatus,
  type AvatarEngineProvider,
} from "../types";

const execFile = promisify(execFileCallback);

/** Directory where rendered MP4s live; shared with the local video provider. */
const RENDER_DIR =
  process.env.LOCAL_RENDER_DIR ?? path.join(process.cwd(), ".local-renders");

/** Scratch directory for downloads used to build a ComfyUI job. */
const TMP_DIR = path.join(RENDER_DIR, "comfyui-tmp");

const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE_PATH = process.env.FFPROBE_PATH ?? "ffprobe";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_LATENTSYNC_NODE = "LatentSync1.6";
const DEFAULT_SEED = 1247;
const DEFAULT_LIPS_EXPRESSION = 1.5;
const DEFAULT_INFERENCE_STEPS = 20;
const DEFAULT_AUDIO_DURATION_SECONDS = 10;

const VIDEO_FILENAME_RE = /\.(mp4|webm)$/i;

interface ComfyUiUploadResponse {
  name?: string;
  subfolder?: string;
  type?: string;
}

interface ComfyUiPromptResponse {
  prompt_id?: string;
  error?: unknown;
  node_errors?: unknown;
}

interface ComfyUiOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

/**
 * ComfyUI LatentSync avatar engine.
 *
 * Drives a locally (or remotely) running ComfyUI instance with the
 * ComfyUI-LatentSyncWrapper custom node (class_type "LatentSync1.6" by
 * default) installed, to produce lip-synced video from a still portrait or
 * source video plus speech audio.
 *
 * Setup:
 *   1. Run ComfyUI with ComfyUI-LatentSyncWrapper installed
 *      (https://github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper).
 *   2. Set `COMFYUI_API_URL` to its base URL, e.g. http://127.0.0.1:8188.
 *      This is the only required env var — without it `isConfigured()` is
 *      false and this provider refuses jobs (use the "mock" engine for a
 *      simulated/no-infra flow instead; this provider has no simulated mode).
 *   3. Optional `COMFYUI_INPUT_DIR` — absolute path to ComfyUI's `input/`
 *      folder on disk (needed when ComfyUI resolves `video_path` relative to
 *      its own working directory differently than this process would, e.g.
 *      a Windows portable install). When unset, a path relative to the
 *      ComfyUI process's cwd ("input/<file>") is used.
 *   4. Optional `COMFYUI_WORKFLOW_PATH` — path to a custom API-format
 *      workflow JSON exported from the ComfyUI UI ("Save (API Format)"),
 *      containing the literal placeholder strings "VIDEO_INPUT_PLACEHOLDER"
 *      and "AUDIO_INPUT_PLACEHOLDER" somewhere a video path / audio filename
 *      string would go. When set, that workflow is used (with placeholders
 *      substituted) instead of the minimal built-in LoadAudio + LatentSync
 *      graph.
 *   5. Optional `COMFYUI_LATENTSYNC_NODE` — override the LatentSync node's
 *      `class_type` if a fork/newer version renamed it (default
 *      "LatentSync1.6").
 */
export class ComfyUiAvatarEngine implements AvatarEngineProvider {
  readonly id = "comfyui";
  readonly name = "ComfyUI LatentSync (local)";
  readonly mode: AvatarEngineProvider["mode"] = "lip_sync";
  readonly supportsStillImage = true;
  readonly supportsSourceVideo = true;
  readonly supportsAudio = true;
  readonly supportsRealtime = false;

  isConfigured(): boolean {
    return Boolean(process.env.COMFYUI_API_URL);
  }

  validateInput(input: AvatarEngineInput): void {
    if (!this.isConfigured()) {
      throw new AvatarEngineError(
        "ComfyUI LatentSync is not configured. Set COMFYUI_API_URL to a " +
          "running ComfyUI instance's base URL (e.g. http://127.0.0.1:8188) " +
          "with the ComfyUI-LatentSyncWrapper custom node installed. This " +
          "engine has no simulated mode — use the mock engine for a " +
          "zero-infrastructure flow.",
        this.id,
        400
      );
    }
    if (!input.audioUrl) {
      throw new AvatarEngineError(
        "ComfyUI LatentSync requires speech audio.",
        this.id,
        400
      );
    }
    if (!input.sourceVideoUrl && !input.avatarImageUrl) {
      throw new AvatarEngineError(
        "ComfyUI LatentSync requires a source video or an avatar image.",
        this.id,
        400
      );
    }
  }

  async createJob(input: AvatarEngineInput): Promise<AvatarEngineJob> {
    this.validateInput(input);

    const baseUrl = this.getBaseUrl();
    const jobUuid = randomUUID();

    await mkdir(TMP_DIR, { recursive: true });

    const audioPath = path.join(
      TMP_DIR,
      `${jobUuid}-audio${this.extensionFromUrl(input.audioUrl, [".mp3", ".wav"], ".mp3")}`
    );
    let videoPath: string | null = null;
    let imagePath: string | null = null;
    let stillVideoPath: string | null = null;

    try {
      await this.downloadTo(input.audioUrl, audioPath);

      let faceVideoPath: string;
      if (input.sourceVideoUrl) {
        videoPath = path.join(
          TMP_DIR,
          `${jobUuid}-video${this.extensionFromUrl(input.sourceVideoUrl, [".mp4"], ".mp4")}`
        );
        await this.downloadTo(input.sourceVideoUrl, videoPath);
        faceVideoPath = videoPath;
      } else {
        // avatarImageUrl is guaranteed by validateInput() when sourceVideoUrl
        // is absent.
        imagePath = path.join(
          TMP_DIR,
          `${jobUuid}-image${this.extensionFromUrl(input.avatarImageUrl!, [".png", ".jpg", ".jpeg"], ".png")}`
        );
        await this.downloadTo(input.avatarImageUrl!, imagePath);

        stillVideoPath = path.join(TMP_DIR, `${jobUuid}-still.mp4`);
        const duration = await this.probeAudioDuration(audioPath);
        await execFile(FFMPEG_PATH, [
          "-loop",
          "1",
          "-i",
          imagePath,
          "-t",
          String(duration),
          "-r",
          "25",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-vf",
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-y",
          stillVideoPath,
        ]);
        faceVideoPath = stillVideoPath;
      }

      const uploadedAudioName = await this.uploadToComfyUi(
        baseUrl,
        audioPath,
        `avatarstudio-${jobUuid}${path.extname(audioPath)}`
      );
      const uploadedVideoName = await this.uploadToComfyUi(
        baseUrl,
        faceVideoPath,
        `avatarstudio-${jobUuid}${path.extname(faceVideoPath)}`
      );

      const resolvedVideoPath = this.resolveVideoPath(uploadedVideoName);
      const graph = await this.buildWorkflowGraph({
        input,
        uploadedAudioName,
        resolvedVideoPath,
      });

      const promptId = await this.submitPrompt(baseUrl, graph);

      return {
        engineId: this.id,
        jobId: promptId,
        status: "queued",
        progress: 0,
      };
    } finally {
      await Promise.allSettled([
        rm(audioPath, { force: true }),
        videoPath ? rm(videoPath, { force: true }) : Promise.resolve(),
        imagePath ? rm(imagePath, { force: true }) : Promise.resolve(),
        stillVideoPath ? rm(stillVideoPath, { force: true }) : Promise.resolve(),
      ]);
    }
  }

  async getJobStatus(jobId: string): Promise<AvatarEngineJobStatus> {
    if (!UUID_REGEX.test(jobId)) {
      throw new AvatarEngineError(`Invalid ComfyUI job ID: ${jobId}`, this.id, 400);
    }

    const mp4Path = path.join(RENDER_DIR, `${jobId}.mp4`);
    if (await this.pathExists(mp4Path)) {
      return {
        status: "completed",
        progress: 100,
        outputVideoUrl: `/api/local-video/${jobId}`,
        error: null,
        metadata: { comfyui: true },
      };
    }

    const baseUrl = this.getBaseUrl();
    const historyRes = await fetch(
      `${baseUrl}/history/${encodeURIComponent(jobId)}`,
      { cache: "no-store" }
    );
    if (!historyRes.ok) {
      throw new AvatarEngineError(
        `ComfyUI history request failed (${historyRes.status}): ${historyRes.statusText}`,
        this.id,
        historyRes.status
      );
    }

    const history = (await historyRes.json()) as unknown;
    const entry = this.getHistoryEntry(history, jobId);
    if (!entry) {
      return { status: "processing", progress: null, metadata: null };
    }

    const failure = this.getHistoryFailure(entry);
    if (failure) {
      return {
        status: "failed",
        progress: null,
        error: failure,
        metadata: null,
      };
    }

    const outputFile = this.findFirstVideoOutput(
      (entry as { outputs?: unknown }).outputs
    );
    if (!outputFile) {
      return {
        status: "failed",
        progress: null,
        error:
          "ComfyUI workflow completed but produced no video output — check the workflow saves a video.",
        metadata: null,
      };
    }

    await mkdir(RENDER_DIR, { recursive: true });
    const tmpPath = path.join(RENDER_DIR, `${jobId}.tmp.mp4`);
    await this.downloadComfyUiFile(baseUrl, outputFile, tmpPath);
    await rename(tmpPath, mp4Path);

    return {
      status: "completed",
      progress: 100,
      outputVideoUrl: `/api/local-video/${jobId}`,
      error: null,
      metadata: { comfyui: true, sourceFilename: outputFile.filename },
    };
  }

  /* ── ComfyUI HTTP helpers ─────────────────────────────────────────────── */

  private getBaseUrl(): string {
    const raw = process.env.COMFYUI_API_URL;
    if (!raw) {
      throw new AvatarEngineError(
        "ComfyUI LatentSync is not configured. Set COMFYUI_API_URL.",
        this.id,
        400
      );
    }
    return raw.replace(/\/$/, "");
  }

  private async uploadToComfyUi(
    baseUrl: string,
    filePath: string,
    filename: string
  ): Promise<string> {
    const bytes = await readFile(filePath);
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(bytes)]),
      filename
    );
    form.append("overwrite", "true");

    const res = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new AvatarEngineError(
        `ComfyUI upload failed (${res.status}): ${detail}`,
        this.id,
        res.status
      );
    }

    const body = (await res.json()) as ComfyUiUploadResponse;
    if (!body.name) {
      throw new AvatarEngineError(
        "ComfyUI upload did not return a stored filename.",
        this.id,
        502
      );
    }
    return body.name;
  }

  private resolveVideoPath(uploadedVideoName: string): string {
    const inputDir = process.env.COMFYUI_INPUT_DIR;
    if (inputDir) {
      return path.join(inputDir, uploadedVideoName);
    }
    return `input/${uploadedVideoName}`;
  }

  private async buildWorkflowGraph(opts: {
    input: AvatarEngineInput;
    uploadedAudioName: string;
    resolvedVideoPath: string;
  }): Promise<Record<string, unknown>> {
    const { input, uploadedAudioName, resolvedVideoPath } = opts;

    const workflowPath = process.env.COMFYUI_WORKFLOW_PATH;
    if (workflowPath) {
      const raw = await readFile(workflowPath, "utf8");
      const substituted = raw
        .split("AUDIO_INPUT_PLACEHOLDER")
        .join(uploadedAudioName)
        .split("VIDEO_INPUT_PLACEHOLDER")
        .join(resolvedVideoPath);
      return JSON.parse(substituted) as Record<string, unknown>;
    }

    const latentSyncNode =
      process.env.COMFYUI_LATENTSYNC_NODE ?? DEFAULT_LATENTSYNC_NODE;
    const seed = (input.engineOptions?.seed as number | undefined) ?? DEFAULT_SEED;
    const inferenceSteps =
      (input.engineOptions?.inferenceSteps as number | undefined) ??
      DEFAULT_INFERENCE_STEPS;
    const lipsExpression = this.mapMotionIntensityToLipsExpression(
      input.motionIntensity
    );

    return {
      "1": {
        class_type: "LoadAudio",
        inputs: {
          audio: uploadedAudioName,
        },
      },
      "2": {
        class_type: latentSyncNode,
        inputs: {
          video_path: resolvedVideoPath,
          audio: ["1", 0],
          seed,
          lips_expression: lipsExpression,
          inference_steps: inferenceSteps,
        },
      },
    };
  }

  private mapMotionIntensityToLipsExpression(
    motionIntensity: number | undefined
  ): number {
    if (typeof motionIntensity !== "number" || Number.isNaN(motionIntensity)) {
      return DEFAULT_LIPS_EXPRESSION;
    }
    const clamped = Math.min(1, Math.max(0, motionIntensity));
    return 1.0 + clamped * 2.0;
  }

  private async submitPrompt(
    baseUrl: string,
    graph: Record<string, unknown>
  ): Promise<string> {
    const res = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: randomUUID() }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      let readable = text;
      try {
        const parsed = JSON.parse(text) as ComfyUiPromptResponse;
        if (parsed.node_errors) {
          readable = `${text} — check that the LatentSync1.6 custom node (ComfyUI-LatentSyncWrapper) is installed in this ComfyUI instance.`;
        }
      } catch {
        // Not JSON — surface the raw text as-is.
      }
      throw new AvatarEngineError(
        `ComfyUI /prompt failed (${res.status}): ${readable}`,
        this.id,
        res.status
      );
    }

    const body = (await res.json()) as ComfyUiPromptResponse;
    if (!body.prompt_id) {
      throw new AvatarEngineError(
        "ComfyUI /prompt did not return a prompt_id.",
        this.id,
        502
      );
    }
    return body.prompt_id;
  }

  private getHistoryEntry(history: unknown, jobId: string): unknown {
    if (!history || typeof history !== "object") return null;
    const record = history as Record<string, unknown>;
    return record[jobId] ?? null;
  }

  private getHistoryFailure(entry: unknown): string | null {
    if (!entry || typeof entry !== "object") return null;
    const status = (entry as { status?: unknown }).status;
    if (!status || typeof status !== "object") return null;
    const statusRecord = status as Record<string, unknown>;

    const statusStr = statusRecord.status_str;
    const completed = statusRecord.completed;

    if (statusStr === "error" || completed === false) {
      const messages = statusRecord.messages;
      if (Array.isArray(messages)) {
        const errorMessage = messages.find(
          (m) => Array.isArray(m) && m[0] === "execution_error"
        );
        if (errorMessage && Array.isArray(errorMessage) && errorMessage[1]) {
          const detail = errorMessage[1] as Record<string, unknown>;
          if (typeof detail.exception_message === "string") {
            return detail.exception_message;
          }
        }
      }
      return "ComfyUI workflow execution failed.";
    }
    return null;
  }

  /**
   * Recursively walks `outputs` (an arbitrary node-id-keyed structure of
   * arrays/objects) looking for the first entry with a string `filename`
   * ending in .mp4/.webm, as produced by SaveVideo-style ComfyUI nodes.
   */
  private findFirstVideoOutput(outputs: unknown): ComfyUiOutputFile | null {
    const visited = new Set<unknown>();

    const walk = (node: unknown): ComfyUiOutputFile | null => {
      if (!node || typeof node !== "object") return null;
      if (visited.has(node)) return null;
      visited.add(node);

      if (Array.isArray(node)) {
        for (const item of node) {
          const found = walk(item);
          if (found) return found;
        }
        return null;
      }

      const record = node as Record<string, unknown>;
      const filename = record.filename;
      if (typeof filename === "string" && VIDEO_FILENAME_RE.test(filename)) {
        const subfolder =
          typeof record.subfolder === "string" ? record.subfolder : "";
        const type = typeof record.type === "string" ? record.type : "output";
        return { filename, subfolder, type };
      }

      for (const value of Object.values(record)) {
        const found = walk(value);
        if (found) return found;
      }
      return null;
    };

    return walk(outputs);
  }

  private async downloadComfyUiFile(
    baseUrl: string,
    file: ComfyUiOutputFile,
    outPath: string
  ): Promise<void> {
    const query = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder,
      type: file.type,
    });
    const url = `${baseUrl}/view?${query.toString()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new AvatarEngineError(
        `ComfyUI /view failed (${res.status}) for ${file.filename}`,
        this.id,
        res.status
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(outPath, buffer);
  }

  /* ── generic file helpers ─────────────────────────────────────────────── */

  private async downloadTo(url: string, outPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new AvatarEngineError(
        `Failed to download ${url} (${res.status}): ${res.statusText}`,
        this.id,
        502
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(outPath, buffer);
  }

  private async probeAudioDuration(audioPath: string): Promise<number> {
    try {
      const { stdout } = await execFile(FFPROBE_PATH, [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audioPath,
      ]);
      const parsed = parseFloat(stdout.trim());
      return Number.isFinite(parsed) && parsed > 0
        ? parsed
        : DEFAULT_AUDIO_DURATION_SECONDS;
    } catch {
      return DEFAULT_AUDIO_DURATION_SECONDS;
    }
  }

  private extensionFromUrl(
    url: string,
    allowed: string[],
    fallback: string
  ): string {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname).toLowerCase();
      return allowed.includes(ext) ? ext : fallback;
    } catch {
      return fallback;
    }
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

export const comfyUiEngine = new ComfyUiAvatarEngine();
