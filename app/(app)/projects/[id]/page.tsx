import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
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

  const details: [string, string][] = [
    ["Avatar", project.avatar_name ?? project.avatar_id],
    ["Voice", project.voice_name ?? project.voice_id],
    ["Language", LANGUAGE_LABELS[project.language] ?? project.language],
    ["Aspect ratio", project.aspect_ratio],
    ["Provider", project.provider],
    ["Created", formatDate(project.created_at)],
  ];

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

      <VideoStatusPoller
        projectId={project.id}
        initialStatus={project.status}
        initialVideoUrl={project.final_video_url}
        initialError={project.error_message}
        aspectRatio={project.aspect_ratio}
      />

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
