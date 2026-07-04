import { NextResponse } from "next/server";
import { getAvatarEngine } from "@/lib/avatar-engines";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/database";

/**
 * Poll endpoint for avatar-engine jobs. Persists transitions on both the
 * project and its avatar_engine_jobs record. Response mirrors the shape of
 * the other status endpoints (plus `progress`) so the shared UI poller
 * works unchanged. RLS scopes everything to the owning user.
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

  if (!project.avatar_engine_id || !project.avatar_engine_job_id) {
    return NextResponse.json(
      { error: "No avatar-engine job exists for this project." },
      { status: 400 }
    );
  }

  // Terminal states never change — skip the engine round-trip.
  if (
    project.avatar_engine_status === "completed" ||
    project.avatar_engine_status === "failed"
  ) {
    return NextResponse.json({
      status: project.avatar_engine_status,
      progress: project.avatar_engine_progress,
      finalVideoUrl: project.animated_video_url,
      errorMessage: project.error_message,
    });
  }

  try {
    const engine = getAvatarEngine(project.avatar_engine_id);
    const result = await engine.getJobStatus(project.avatar_engine_job_id);

    const changed =
      result.status !== project.avatar_engine_status ||
      (result.progress ?? null) !== project.avatar_engine_progress ||
      Boolean(result.outputVideoUrl);

    if (changed) {
      const mappedProjectStatus =
        result.status === "queued" ? "pending" : result.status;

      await supabase
        .from("projects")
        .update({
          avatar_engine_status: result.status,
          avatar_engine_progress: result.progress ?? null,
          animated_video_url: result.outputVideoUrl ?? null,
          engine_metadata: (result.metadata ??
            project.engine_metadata) as Record<string, unknown> | null,
          // Mirror into the main render fields so dashboard badges and the
          // download flow treat the animated MP4 as the project's result.
          status: mappedProjectStatus,
          final_video_url: result.outputVideoUrl ?? project.final_video_url,
          error_message: result.error ?? null,
        })
        .eq("id", projectId);

      await supabase
        .from("avatar_engine_jobs")
        .update({
          status: result.status,
          progress: result.progress ?? null,
          output: result.outputVideoUrl
            ? { outputVideoUrl: result.outputVideoUrl }
            : null,
          error: result.error ?? null,
        })
        .eq("project_id", projectId)
        .eq("job_id", project.avatar_engine_job_id);
    }

    return NextResponse.json({
      status: result.status,
      progress: result.progress ?? null,
      finalVideoUrl: result.outputVideoUrl ?? null,
      errorMessage: result.error ?? null,
    });
  } catch (err) {
    console.error("avatar-engine getJobStatus failed:", err);
    // Report the stored state; the client will poll again.
    return NextResponse.json({
      status: project.avatar_engine_status,
      progress: project.avatar_engine_progress,
      finalVideoUrl: project.animated_video_url,
      errorMessage: project.error_message,
    });
  }
}
