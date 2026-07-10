import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { VideoStatusPoller } from "@/components/video-status-poller";
import { LANGUAGE_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { Project } from "@/types/database";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();
  const project = data as Project;

  const isAvatarEngine = Boolean(project.avatar_engine_job_id);
  const isLipSync = !isAvatarEngine && Boolean(project.lipsync_job_id);
  // A "lipsync" project without a job means the job never started.
  const lipsyncNeverStarted =
    project.provider === "lipsync" && !project.lipsync_job_id;

  const details: [string, string][] = [
    ["Avatar", project.avatar_name ?? project.avatar_id],
    ["Voice", project.voice_name ?? project.voice_id],
    ["Language", LANGUAGE_LABELS[project.language] ?? project.language],
    ["Aspect ratio", project.aspect_ratio],
    ["Provider", project.provider],
    ...(project.avatar_engine_id
      ? ([
          ["Engine", project.avatar_engine_id],
          ["Engine mode", project.avatar_engine_mode ?? "auto"],
        ] as [string, string][])
      : []),
    ...(project.lipsync_provider
      ? ([["Lip sync", project.lipsync_provider]] as [string, string][])
      : []),
    ["Created", formatDate(project.created_at)],
  ];

  const hasSources = Boolean(
    project.source_avatar_image_url ||
      project.source_video_url ||
      project.source_audio_url
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard" aria-label="Back to dashboard">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{project.title}</h1>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {lipsyncNeverStarted ? (
        <Alert variant="destructive">
          <AlertTitle>Lip-sync job never started</AlertTitle>
          <AlertDescription>
            This project was created for the lip-sync pipeline but no job was
            registered. Create a new video and try again.
          </AlertDescription>
        </Alert>
      ) : (
        <VideoStatusPoller
          projectId={project.id}
          initialStatus={
            isAvatarEngine
              ? project.avatar_engine_status === "queued"
                ? "pending"
                : project.avatar_engine_status ?? project.status
              : isLipSync
                ? project.lipsync_status ?? project.status
                : project.status
          }
          initialVideoUrl={
            project.animated_video_url ??
            project.lipsynced_video_url ??
            project.final_video_url
          }
          initialError={project.error_message}
          aspectRatio={project.aspect_ratio}
          statusEndpoint={
            isAvatarEngine
              ? `/api/avatar-engine/status/${project.id}`
              : isLipSync
                ? `/api/lipsync/status/${project.id}`
                : undefined
          }
        />
      )}

      {hasSources && (
        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-6">
            {project.source_avatar_image_url && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Avatar image
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={project.source_avatar_image_url}
                  alt="Source avatar"
                  className="h-32 w-32 rounded-lg border object-cover"
                />
              </div>
            )}
            {project.source_video_url && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Source video
                </p>
                <video
                  src={project.source_video_url}
                  controls
                  playsInline
                  className="h-32 rounded-lg border"
                />
              </div>
            )}
            {project.source_audio_url && (
              <div className="min-w-64 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Audio
                </p>
                <audio src={project.source_audio_url} controls className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Script</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {project.script}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {details.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="truncate font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
