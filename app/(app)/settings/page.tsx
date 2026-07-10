import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPlan } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";
import { getVideoProvider, isMockMode } from "@/lib/video-providers";
import type { Profile } from "@/types/database";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .single();
  const profile = profileData as Profile | null;
  const plan = getPlan(profile?.plan ?? "free");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: totalCount } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true });
  const { count: monthCount } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfMonth.toISOString());

  const usedThisMonth = monthCount ?? 0;
  const provider = getVideoProvider();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Account, plan, and API usage.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plan</span>
            <Badge variant="secondary">{plan.name}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API usage</CardTitle>
          <CardDescription>
            Renders count against your monthly plan limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Videos this month</span>
            <span className="font-medium">
              {usedThisMonth} / {plan.videosPerMonth}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.min(
                  100,
                  (usedThisMonth / plan.videosPerMonth) * 100
                )}%`,
              }}
            />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total videos</span>
            <span className="font-medium">{totalCount ?? 0}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Video provider</CardTitle>
          <CardDescription>
            Configured via environment variables — API keys never leave the
            server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Active provider</span>
            <Badge variant={isMockMode() ? "warning" : "success"}>
              {provider.name}
            </Badge>
          </div>
          {isMockMode() && (
            <p className="text-muted-foreground">
              Mock mode simulates renders. Set{" "}
              <code className="rounded bg-muted px-1">VIDEO_PROVIDER=local</code>{" "}
              for free real renders (needs ffmpeg), or{" "}
              <code className="rounded bg-muted px-1">HEYGEN_API_KEY</code> for
              HeyGen.
            </p>
          )}
          {provider.name === "local" && (
            <p className="text-muted-foreground">
              Free local rendering: Microsoft Edge neural voices + ffmpeg. No
              API key or subscription required.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
