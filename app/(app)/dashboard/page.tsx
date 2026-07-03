import Link from "next/link";
import type { Metadata } from "next";
import { Plus, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCard } from "@/components/project-card";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/database";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  const list = (projects ?? []) as Project[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your videos</h1>
          <p className="text-sm text-muted-foreground">
            {list.length === 0
              ? "Nothing here yet — create your first video."
              : `${list.length} project${list.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button asChild>
          <Link href="/create">
            <Plus />
            New video
          </Link>
        </Button>
      </div>

      {list.length === 0 ? (
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
          {list.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
