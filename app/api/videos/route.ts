import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_SCRIPT_LENGTH } from "@/lib/constants";
import { moderateScript } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/server";
import { getVideoProvider } from "@/lib/video-providers";
import { VideoProviderError } from "@/lib/video-providers/types";

const createVideoSchema = z.object({
  title: z.string().min(1).max(120),
  script: z.string().min(1).max(MAX_SCRIPT_LENGTH),
  avatarId: z.string().min(1),
  avatarName: z.string().nullable().optional(),
  voiceId: z.string().min(1),
  voiceName: z.string().nullable().optional(),
  language: z.string().min(2).max(10),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  consent: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm you have rights and consent for this content.",
    }),
  }),
});

/** Starts a video render and stores the project. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createVideoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // Moderation gate (placeholder rules — see lib/moderation.ts).
  const moderation = moderateScript(input.script);
  if (!moderation.allowed) {
    return NextResponse.json({ error: moderation.reason }, { status: 422 });
  }

  const provider = getVideoProvider();

  let providerVideoId: string;
  try {
    ({ providerVideoId } = await provider.createVideo({
      title: input.title,
      script: input.script,
      avatarId: input.avatarId,
      voiceId: input.voiceId,
      backgroundColor: input.backgroundColor,
      aspectRatio: input.aspectRatio,
    }));
  } catch (err) {
    console.error("createVideo failed:", err);
    const message =
      err instanceof VideoProviderError
        ? err.message
        : "The video provider rejected the request.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { data: project, error: dbError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: input.title,
      script: input.script,
      avatar_id: input.avatarId,
      avatar_name: input.avatarName ?? null,
      voice_id: input.voiceId,
      voice_name: input.voiceName ?? null,
      language: input.language,
      aspect_ratio: input.aspectRatio,
      background_color: input.backgroundColor,
      status: "pending",
      provider: provider.name,
      provider_video_id: providerVideoId,
      final_video_url: null,
      thumbnail_url: null,
      error_message: null,
    })
    .select("id")
    .single();

  if (dbError || !project) {
    console.error("project insert failed:", dbError);
    return NextResponse.json(
      { error: "Render started but the project could not be saved." },
      { status: 500 }
    );
  }

  return NextResponse.json({ projectId: project.id }, { status: 201 });
}
