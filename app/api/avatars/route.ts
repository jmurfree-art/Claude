import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVideoProvider } from "@/lib/video-providers";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const avatars = await getVideoProvider().listAvatars();
    return NextResponse.json({ avatars });
  } catch (err) {
    console.error("listAvatars failed:", err);
    return NextResponse.json(
      { error: "Failed to load avatars from the video provider." },
      { status: 502 }
    );
  }
}
