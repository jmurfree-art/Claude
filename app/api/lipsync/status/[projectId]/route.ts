import { NextResponse } from "next/server";
import { getLipSyncProviderByName } from "@/lib/lipsync";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/database";

/**
 * Poll endpoint for lip-sync jobs. Persists transitions on the project and
 * mirrors the shape of /api/videos/:id/status so the UI poller can consume
 * either. RLS guarantees users only reach their own projects.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: projectData } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (!projectData) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const project = projectData as Project;

  if (!project.lipsync_provider || !project.lipsync_job_id) {
    return NextResponse.json(
      { error: "No lip-sync job exists for this project." },
      { status: 400 }
    );
  }

  // Terminal states never change — skip the provider round-trip.
  if (
    project.lipsync_status === "completed" ||
    project.lipsync_status === "failed"
  ) {
    return NextResponse.json({
      status: project.lipsync_status,
      finalVideoUrl: project.lipsynced_video_url,
      errorMessage: project.error_message,
    });
  }

  try {
    const provider = getLipSyncProviderByName(project.lipsync_provider);
    const result = await provider.getLipSyncStatus(project.lipsync_job_id);

    if (result.status !== project.lipsync_status || result.outputVideoUrl) {
      await supabase
        .from("projects")
        .update({
          lipsync_status: result.status,
          lipsynced_video_url: result.outputVideoUrl ?? null,
          // Mirror into the main render fields so the dashboard badge and
          // download flow treat the lip-synced MP4 as the project's result.
          status: result.status,
          final_video_url:
            result.outputVideoUrl ?? project.final_video_url,
          error_message: result.error ?? null,
        })
        .eq("id", projectId);
    }

    return NextResponse.json({
      status: result.status,
      finalVideoUrl: result.outputVideoUrl ?? null,
      errorMessage: result.error ?? null,
    });
  } catch (err) {
    console.error("getLipSyncStatus failed:", err);
    // Report the stored state; the client will poll again.
    return NextResponse.json({
      status: project.lipsync_status,
      finalVideoUrl: project.lipsynced_video_url,
      errorMessage: project.error_message,
    });
  }
}
