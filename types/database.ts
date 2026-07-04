import type { AspectRatio, RenderStatus } from "@/lib/video-providers/types";

export type ProjectStatus = RenderStatus;

// NOTE: Project and Profile are `type` aliases (not interfaces) on purpose —
// supabase-js requires Row types to be assignable to Record<string, unknown>,
// which interfaces don't satisfy (no implicit index signature).
export type Project = {
  id: string;
  user_id: string;
  title: string;
  script: string;
  avatar_id: string;
  avatar_name: string | null;
  voice_id: string;
  voice_name: string | null;
  language: string;
  aspect_ratio: AspectRatio;
  background_color: string;
  status: ProjectStatus;
  provider: string;
  provider_video_id: string | null;
  final_video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  lipsync_provider: string | null;
  lipsync_job_id: string | null;
  lipsync_status: ProjectStatus | null;
  audio_url: string | null;
  source_avatar_url: string | null;
  lipsynced_video_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  plan: "free" | "creator" | "pro";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Partial<Project> &
          Pick<
            Project,
            | "user_id"
            | "title"
            | "script"
            | "avatar_id"
            | "voice_id"
            | "language"
            | "aspect_ratio"
            | "status"
            | "provider"
          >;
        Update: Partial<Project>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at"> &
          Partial<Pick<Profile, "created_at">>;
        Update: Partial<Profile>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
