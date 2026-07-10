import { NextResponse } from "next/server";
import { z } from "zod";
import { getAvatarEngine, resolveAvatarEngine } from "@/lib/avatar-engines";
import {
  AVATAR_ENGINE_IDS,
  AvatarEngineError,
  ENGINE_MODES,
  type EngineMode,
} from "@/lib/avatar-engines/types";
import { MAX_SCRIPT_LENGTH } from "@/lib/constants";
import { moderateScript } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/server";
import { pickEdgeVoice, synthesizeSpeechToBuffer } from "@/lib/tts";
import type { AspectRatio } from "@/lib/video-providers/types";

const createSchema = z.object({
  /** Existing project to animate; when absent a new project is created. */
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(120).default("Untitled avatar video"),
  script: z.string().min(1).max(MAX_SCRIPT_LENGTH),
  language: z.string().min(2).max(10).default("en"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  engine: z.enum(["auto", ...AVATAR_ENGINE_IDS]).default("auto"),
  mode: z.enum(ENGINE_MODES).default("auto"),
  avatarImageUrl: z.string().url().nullable().optional(),
  sourceVideoUrl: z.string().url().nullable().optional(),
  audioUrl: z.string().url().nullable().optional(),
  emotion: z.string().max(30).optional(),
  motionIntensity: z.number().min(0).max(1).optional(),
  engineOptions: z.record(z.unknown()).optional(),
  consent: z.literal(true, {
    errorMap: () => ({
      message:
        "You must confirm you have permission to use this person's face, voice, likeness, and uploaded media.",
    }),
  }),
});

/**
 * Starts an avatar-engine animation job:
 * auth → consent → moderation → resolve engine → validate media →
 * ensure speech audio → create/update project + job records → dispatch.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const moderation = moderateScript(input.script);
  if (!moderation.allowed) {
    return NextResponse.json({ error: moderation.reason }, { status: 422 });
  }

  // Resolve the engine up front so media validation fails before any writes.
  let engine;
  try {
    engine = resolveAvatarEngine({
      engine: input.engine,
      mode: input.mode as EngineMode,
      hasSourceVideo: Boolean(input.sourceVideoUrl),
      hasAvatarImage: Boolean(input.avatarImageUrl),
      getEngine: getAvatarEngine,
    });
  } catch (err) {
    const message =
      err instanceof AvatarEngineError ? err.message : "Unknown engine.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Ensure speech audio exists (upload-provided or synthesized free TTS).
  let audioUrl = input.audioUrl ?? null;
  if (!audioUrl) {
    try {
      const voice = pickEdgeVoice(null, input.language);
      const audio = await synthesizeSpeechToBuffer(voice, input.script);
      const storagePath = `${user.id}/engine-audio/${crypto.randomUUID()}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(storagePath, audio, { contentType: "audio/mpeg", upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      audioUrl = supabase.storage.from("videos").getPublicUrl(storagePath)
        .data.publicUrl;
    } catch (err) {
      console.error("avatar-engine audio generation failed:", err);
      return NextResponse.json(
        {
          error:
            "Could not generate speech audio. " +
            (err instanceof Error ? err.message : ""),
        },
        { status: 502 }
      );
    }
  }

  // Validate required media for the chosen engine before creating records.
  const engineInput = {
    userId: user.id,
    projectId: input.projectId ?? "pending",
    script: input.script,
    audioUrl,
    avatarImageUrl: input.avatarImageUrl ?? null,
    sourceVideoUrl: input.sourceVideoUrl ?? null,
    language: input.language,
    aspectRatio: input.aspectRatio as AspectRatio,
    emotion: input.emotion,
    motionIntensity: input.motionIntensity,
    engineOptions: input.engineOptions,
  };
  try {
    engine.validateInput(engineInput);
  } catch (err) {
    const message =
      err instanceof AvatarEngineError ? err.message : "Invalid media.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Create or load the project row.
  let projectId = input.projectId ?? null;
  if (!projectId) {
    const { data: created, error: insertError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: input.title,
        script: input.script,
        avatar_id: input.avatarImageUrl ? "custom-upload" : "engine-default",
        voice_id: pickEdgeVoice(null, input.language),
        language: input.language,
        aspect_ratio: input.aspectRatio,
        status: "pending",
        provider: "avatar-engine",
      })
      .select("id")
      .single();
    if (insertError || !created) {
      console.error("avatar-engine project insert failed:", insertError);
      return NextResponse.json(
        { error: "Could not create the project." },
        { status: 500 }
      );
    }
    projectId = created.id;
  } else {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
  }

  // Dispatch the engine job.
  let job;
  try {
    job = await engine.createJob({ ...engineInput, projectId });
  } catch (err) {
    console.error("avatar-engine createJob failed:", err);
    const status =
      err instanceof AvatarEngineError ? err.statusCode ?? 502 : 502;
    const message =
      err instanceof AvatarEngineError
        ? err.message
        : "The avatar engine rejected the request.";
    return NextResponse.json({ error: message }, { status });
  }

  // Persist project pipeline state + the job audit record.
  const { error: updateError } = await supabase
    .from("projects")
    .update({
      avatar_engine_id: engine.id,
      avatar_engine_mode: input.mode,
      avatar_engine_job_id: job.jobId,
      avatar_engine_status: job.status,
      avatar_engine_progress: job.progress ?? 0,
      source_audio_url: audioUrl,
      source_avatar_image_url: input.avatarImageUrl ?? null,
      source_video_url: input.sourceVideoUrl ?? null,
      animated_video_url: null,
      engine_metadata: (job.metadata ?? null) as Record<string, unknown> | null,
      consent_confirmed: true,
      status: "processing",
      error_message: null,
    })
    .eq("id", projectId);
  if (updateError) {
    console.error("avatar-engine project update failed:", updateError);
  }

  await supabase.from("avatar_engine_jobs").insert({
    user_id: user.id,
    project_id: projectId,
    engine_id: engine.id,
    job_id: job.jobId,
    status: job.status,
    progress: job.progress ?? 0,
    input: {
      audioUrl,
      avatarImageUrl: input.avatarImageUrl ?? null,
      sourceVideoUrl: input.sourceVideoUrl ?? null,
      language: input.language,
      aspectRatio: input.aspectRatio,
      emotion: input.emotion ?? null,
      motionIntensity: input.motionIntensity ?? null,
      mode: input.mode,
    },
  });

  return NextResponse.json(
    {
      projectId,
      engineId: engine.id,
      jobId: job.jobId,
      status: job.status,
      simulated: !engine.isConfigured(),
    },
    { status: 201 }
  );
}
