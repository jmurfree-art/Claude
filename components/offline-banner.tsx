"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/components/use-online";

/** Slim banner shown app-wide while the browser is offline. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <WifiOff className="h-3.5 w-3.5" />
      You&apos;re offline — showing locally saved data. Drafts can still be
      created and edited.
    </div>
  );
}
