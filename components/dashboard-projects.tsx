"use client";

import * as React from "react";
import Link from "next/link";
import { FileEdit, Trash2, VideoOff, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCard } from "@/components/project-card";
import { useOnline } from "@/components/use-online";
import {
  deleteDraft,
  listDrafts,
  type VideoDraft,
} from "@/lib/offline/drafts";
import {
  cacheProjects,
  getCachedProjects,
} from "@/lib/offline/projects-cache";
import { formatDate } from "@/lib/utils";
import type { Project } from "@/types/database";

/**
 * Offline-aware project list.
 *
 * Online: refreshes from /api/projects and mirrors the result into
 * IndexedDB. Offline: renders the mirrored copy, plus locally stored
 * drafts, so the dashboard stays manageable without a connection.
 */
export function DashboardProjects({
  initialProjects,
}: {
  initialProjects: Project[];
}) {
  const online = useOnline();
  const [projects, setProjects] = React.useState<Project[]>(initialProjects);
  const [fromCache, setFromCache] = React.useState(false);
  const [drafts, setDrafts] = React.useState<VideoDraft[]>([]);

  // Server-rendered list is authoritative when it arrives — mirror it.
  React.useEffect(() => {
    if (initialProjects.length > 0) {
      void cacheProjects(initialProjects);
    }
  }, [initialProjects]);

  // Refresh from the network; fall back to the local mirror offline.
  React.useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) throw new Error("refresh failed");
        const body = (await res.json()) as { projects: Project[] };
        if (cancelled) return;
        setProjects(body.projects);
        setFromCache(false);
        void cacheProjects(body.projects);
      } catch {
        const cached = await getCachedProjects();
        if (cancelled) return;
        if (cached.length > 0) {
          setProjects(cached);
          setFromCache(true);
        }
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [online]);

  const refreshDrafts = React.useCallback(() => {
    void listDrafts().then(setDrafts);
  }, []);

  React.useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  async function handleDeleteDraft(id: string) {
    await deleteDraft(id);
    refreshDrafts();
  }

  return (
    <div className="space-y-8">
      {fromCache && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5" />
          Showing your locally saved copy — statuses may be out of date.
        </p>
      )}

      {drafts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Drafts (stored on this device)
          </h2>
          <div className="grid gap-3">
            {drafts.map((draft) => (
              <Card key={draft.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <FileEdit className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {draft.title || "Untitled draft"}
                    </p>
                    <p className="line-clamp-1 text-sm text-muted-foreground">
                      {draft.script || "No script yet"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {draft.aspectRatio} · saved {formatDate(draft.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/create?draft=${draft.id}`}>Continue</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete draft"
                      onClick={() => handleDeleteDraft(draft.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {drafts.length > 0 && (
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rendered videos
          </h2>
        )}
        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <VideoOff className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No videos yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Write a script, pick an avatar and voice, and your first render
                will show up here with live status.
              </p>
              <Button asChild className="mt-2">
                <Link href="/create">Create a video</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
