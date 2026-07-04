import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveLipSyncProvider } from "@/lib/lipsync";
import { LIPSYNC_ENGINES, LipSyncProviderError } from "@/lib/lipsync/types";
import { createClient } from "@/lib/supabase/server";
import { pickEdgeVoice, synthesizeSpeechToBuffer } from "@/lib/tts";
import type { AspectRatio } from "@/lib/video-providers/types";
import type { Project } from "@/types/database";

const createLipSyncSchema = z.object({
  projectId: z.string().uuid(),
  engine: z.enum(LIPSYNC_ENGINES).default("auto"),
  avatarImageUrl: z.string().url().nullable().optional(),
  sourceVideoUrl: z.string().url().nullable().optional(),
  /** Pre-generated speech audio; when absent it is synthesized from the script. */
  audioUrl: z.string().url().nullable().optional(),
  providerOptions: z.record(z.unknown()).optional(),
  consent: z.literal(true, {
    errorMap: () => ({
      message:
        "You must confirm you have permission to use this person's image, voice, and likeness.",
    }),
  }),
});

/**
 * Starts a lip-sync job for an existing project:
 * 1. ensures speech audio exists (generates + stores it if not supplied),
 * 2. hands audio + face source to the selected lip-sync provider,
 * 3. persists the provider job on the project for status polling.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createLipSyncSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const { data: projectData } = await supabase
    .from("projects")
    .select("*")
    .eq("id", input.projectId)
    .single();
  if (!projectData) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const project = projectData as Project;

  // Step 1 — speech audio. Use the caller's, the project's stored audio, or
  // synthesize now and upload to the public "videos" bucket so remote
  // lip-sync providers can fetch it.
  let audioUrl = input.audioUrl ?? project.audio_url;
  if (!audioUrl) {
    try {
      const voice = pickEdgeVoice(project.voice_id, project.language);
      const audio = await synthesizeSpeechToBuffer(voice, project.script);
      const storagePath = `${user.id}/lipsync/${project.id}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(storagePath, audio, {
          contentType: "audio/mpeg",
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);
      audioUrl = supabase.storage.from("videos").getPublicUrl(storagePath)
        .data.publicUrl;
    } catch (err) {
      console.error("lip-sync audio generation failed:", err);
      return NextResponse.json(
        {
          error:
            "Could not generate speech audio for this script. " +
            (err instanceof Error ? err.message : ""),
        },
        { status: 502 }
      );
    }
  }

  // Step 2 — create the provider job.
  let provider;
  let job;
  try {
    provider = resolveLipSyncProvider(input.engine);
    job = await provider.createLipSyncJob({
      userId: user.id,
      projectId: project.id,
      avatarImageUrl: input.avatarImageUrl ?? null,
      sourceVideoUrl: input.sourceVideoUrl ?? null,
      audioUrl,
      script: project.script,
      language: project.language,
      aspectRatio: project.aspect_ratio as AspectRatio,
      providerOptions: input.providerOptions,
    });
  } catch (err) {
    console.error("createLipSyncJob failed:", err);
    const status = err instanceof LipSyncProviderError ? err.statusCode ?? 502 : 502;
    const message =
      err instanceof LipSyncProviderError
        ? err.message
        : "The lip-sync provider rejected the request.";
    return NextResponse.json({ error: message }, { status });
  }

  // Step 3 — persist the job handle for polling.
  const { error: dbError } = await supabase
    .from("projects")
    .update({
      lipsync_provider: job.provider,
      lipsync_job_id: job.jobId,
      lipsync_status: job.status,
      audio_url: audioUrl,
      source_avatar_url: input.sourceVideoUrl ?? input.avatarImageUrl ?? null,
      lipsynced_video_url: null,
      status: "processing",
      error_message: null,
    })
    .eq("id", project.id);

  if (dbError) {
    console.error("lip-sync project update failed:", dbError);
    return NextResponse.json(
      { error: "Job started but the project could not be updated." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      projectId: project.id,
      provider: job.provider,
      jobId: job.jobId,
      status: job.status,
    },
    { status: 201 }
  );
}
