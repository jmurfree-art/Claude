import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <h1 className="text-3xl font-bold mb-4">You&apos;re offline</h1>
        <p className="text-muted-foreground mb-8">
          This page isn&apos;t cached yet. Your dashboard and previously viewed
          projects are still available.
        </p>
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
