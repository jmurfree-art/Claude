import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RENDER_DIR =
  process.env.LOCAL_RENDER_DIR ?? path.join(process.cwd(), ".local-renders");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Streams an MP4 rendered by the local provider. Auth-gated. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid video ID." }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(RENDER_DIR, `${id}.mp4`));
  } catch {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": 'inline; filename="avatar-video.mp4"',
    },
  });
}
