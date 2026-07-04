import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/database";

const cancelSchema = z.object({ projectId: z.string().uuid() });

/**
 * Cancels an in-flight avatar-engine job from the app's perspective: the
 * project and job records are marked failed ("canceled by user") and
 * polling stops.
 *
 * TODO(engines): the shared microservice contract has no cancel endpoint
 * yet — when engine services grow one (e.g. DELETE /jobs/{jobId}),
 * propagate the cancellation here so GPU work actually stops.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = cancelSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: projectData } = await supabase
    .from("projects")
    .select("*")
    .eq("id", parsed.data.projectId)
    .single();
  if (!projectData) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const project = projectData as Project;

  if (!project.avatar_engine_job_id) {
    return NextResponse.json(
      { error: "No avatar-engine job to cancel." },
      { status: 400 }
    );
  }
  if (
    project.avatar_engine_status === "completed" ||
    project.avatar_engine_status === "failed"
  ) {
    return NextResponse.json(
      { error: "Job already finished." },
      { status: 409 }
    );
  }

  const CANCELED = "Canceled by user.";
  await supabase
    .from("projects")
    .update({
      avatar_engine_status: "failed",
      status: "failed",
      error_message: CANCELED,
    })
    .eq("id", project.id);
  await supabase
    .from("avatar_engine_jobs")
    .update({ status: "failed", error: CANCELED })
    .eq("project_id", project.id)
    .eq("job_id", project.avatar_engine_job_id);

  return NextResponse.json({ ok: true, status: "failed" });
}
