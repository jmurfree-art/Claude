import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVideoProvider } from "@/lib/video-providers";

/**
 * Poll endpoint: checks the provider for render progress, persists any
 * change to the project row, and returns the current state.
 * RLS guarantees users can only reach their own projects.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Terminal states never change — skip the provider round-trip.
  if (
    project.status === "completed" ||
    project.status === "failed" ||
    !project.provider_video_id
  ) {
    return NextResponse.json({
      status: project.status,
      finalVideoUrl: project.final_video_url,
      errorMessage: project.error_message,
    });
  }

  try {
    const result = await getVideoProvider().getVideoStatus(
      project.provider_video_id
    );

    if (result.status !== project.status || result.videoUrl) {
      await supabase
        .from("projects")
        .update({
          status: result.status,
          final_video_url: result.videoUrl,
          thumbnail_url: result.thumbnailUrl ?? project.thumbnail_url,
          error_message: result.error,
        })
        .eq("id", id);
    }

    return NextResponse.json({
      status: result.status,
      finalVideoUrl: result.videoUrl,
      errorMessage: result.error,
    });
  } catch (err) {
    console.error("getVideoStatus failed:", err);
    // Report the stored state; the client will poll again.
    return NextResponse.json({
      status: project.status,
      finalVideoUrl: project.final_video_url,
      errorMessage: project.error_message,
    });
  }
}
