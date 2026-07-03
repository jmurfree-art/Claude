import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardProjects } from "@/components/dashboard-projects";
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
            Renders and local drafts — available offline too.
          </p>
        </div>
        <Button asChild>
          <Link href="/create">
            <Plus />
            New video
          </Link>
        </Button>
      </div>

      <DashboardProjects initialProjects={list} />
    </div>
  );
}
