"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { STATUS_POLL_INTERVAL_MS } from "@/lib/constants";
import type { ProjectStatus } from "@/types/database";

interface StatusResponse {
  status: ProjectStatus;
  finalVideoUrl: string | null;
  errorMessage: string | null;
}

/**
 * Polls the render status API until the project reaches a terminal state,
 * then shows the MP4 preview + download button (or the failure reason).
 */
export function VideoStatusPoller({
  projectId,
  initialStatus,
  initialVideoUrl,
  initialError,
  aspectRatio,
  statusEndpoint,
}: {
  projectId: string;
  initialStatus: ProjectStatus;
  initialVideoUrl: string | null;
  initialError: string | null;
  aspectRatio: string;
  /** Override for lip-sync jobs; defaults to the standard render endpoint. */
  statusEndpoint?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<ProjectStatus>(initialStatus);
  const [videoUrl, setVideoUrl] = React.useState(initialVideoUrl);
  const [error, setError] = React.useState(initialError);

  const isTerminal = status === "completed" || status === "failed";

  React.useEffect(() => {
    if (isTerminal) return;

    let cancelled = false;
    const endpoint = statusEndpoint ?? `/api/videos/${projectId}/status`;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) return; // transient — keep polling
        const body = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(body.status);
        setVideoUrl(body.finalVideoUrl);
        setError(body.errorMessage);
        if (body.status === "completed" || body.status === "failed") {
          // Refresh server components (status badge, metadata) too.
          router.refresh();
        }
      } catch {
        // network hiccup — keep polling
      }
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, isTerminal, router, statusEndpoint]);

  const aspectClass =
    aspectRatio === "9:16"
      ? "aspect-[9/16] max-w-sm"
      : aspectRatio === "1:1"
        ? "aspect-square max-w-lg"
        : "aspect-video";

  if (status === "completed" && videoUrl) {
    return (
      <div className="space-y-4">
        <div
          className={`mx-auto w-full overflow-hidden rounded-xl border bg-black ${aspectClass}`}
        >
          <video
            src={videoUrl}
            controls
            playsInline
            className="h-full w-full"
          />
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <a href={videoUrl} download target="_blank" rel="noopener noreferrer">
              <Download />
              Download MP4
            </a>
          </Button>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Render failed</AlertTitle>
        <AlertDescription>
          {error ?? "The provider reported an error. Try generating again."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div
      className={`mx-auto flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/40 ${aspectClass}`}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-medium">
        {status === "pending" ? "Queued for rendering…" : "Rendering your video…"}
      </p>
      <p className="px-6 text-center text-xs text-muted-foreground">
        This usually takes a few minutes. You can leave this page — the video
        keeps rendering and will appear in your dashboard.
      </p>
    </div>
  );
}
