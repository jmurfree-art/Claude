import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Returns the signed-in user's projects (newest first) for client refresh + offline caching. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load projects." },
      { status: 500 }
    );
  }

  return NextResponse.json({ projects: projects ?? [] });
}
