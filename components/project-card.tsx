import Link from "next/link";
import { Film } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LANGUAGE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { Project } from "@/types/database";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="group block">
      <Card className="transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-start gap-4 p-4">
          <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {project.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.thumbnail_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Film className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium">{project.title}</p>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
              {project.script}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {LANGUAGE_LABELS[project.language] ?? project.language} ·{" "}
              {project.aspect_ratio} · {formatDate(project.created_at)}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
