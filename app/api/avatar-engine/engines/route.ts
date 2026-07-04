import { NextResponse } from "next/server";
import { listAvatarEngines } from "@/lib/avatar-engines";
import { createClient } from "@/lib/supabase/server";

/**
 * Lists available avatar engines with capabilities and whether each has a
 * real endpoint configured (unconfigured engines run simulated jobs).
 * Only safe metadata is returned — never keys or endpoint URLs.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const engines = listAvatarEngines().map((engine) => ({
    id: engine.id,
    name: engine.name,
    mode: engine.mode,
    supportsStillImage: engine.supportsStillImage,
    supportsSourceVideo: engine.supportsSourceVideo,
    supportsAudio: engine.supportsAudio,
    supportsRealtime: engine.supportsRealtime,
    configured: engine.isConfigured(),
  }));

  return NextResponse.json({ engines });
}
