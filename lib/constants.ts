import type { AspectRatio } from "@/lib/video-providers/types";

export const APP_NAME = "AvatarStudio";

export const ASPECT_RATIOS: {
  value: AspectRatio;
  label: string;
  description: string;
}[] = [
  { value: "16:9", label: "16:9", description: "Landscape — YouTube, web" },
  { value: "9:16", label: "9:16", description: "Portrait — Reels, TikTok" },
  { value: "1:1", label: "1:1", description: "Square — feed posts" },
];

export const ASPECT_RATIO_DIMENSIONS: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 720, height: 720 },
};

export interface BackgroundOption {
  id: string;
  label: string;
  /** CSS/hex color sent to the provider as a solid background. */
  value: string;
}

export const BACKGROUNDS: BackgroundOption[] = [
  { id: "studio-white", label: "Studio White", value: "#FFFFFF" },
  { id: "soft-gray", label: "Soft Gray", value: "#F0F2F5" },
  { id: "charcoal", label: "Charcoal", value: "#1F2328" },
  { id: "midnight", label: "Midnight Blue", value: "#0F1D3A" },
  { id: "forest", label: "Forest Green", value: "#14532D" },
  { id: "sand", label: "Warm Sand", value: "#EDE0CE" },
  { id: "lavender", label: "Lavender", value: "#E6E0F8" },
  { id: "coral", label: "Coral", value: "#F97362" },
];

export interface LanguageOption {
  code: string;
  label: string;
}

/**
 * Languages offered in the UI. Voices returned by the provider are filtered
 * against the selected language (case-insensitive prefix match on the
 * provider's language label).
 */
export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "tr", label: "Turkish" },
];

export const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.label])
);

export const MAX_SCRIPT_LENGTH = 2000;

/** How often the client polls render status, in milliseconds. */
export const STATUS_POLL_INTERVAL_MS = 5000;
