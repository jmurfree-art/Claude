"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

export type AvatarEngineChoice =
  | "off"
  | "auto"
  | "comfyui"
  | "wav2lip"
  | "latentsync"
  | "echomimic"
  | "musetalk"
  | "liveportrait"
  | "videoretalking"
  | "mock";

export type AvatarEngineModeChoice =
  | "auto"
  | "highest_quality"
  | "fast_preview"
  | "expressive"
  | "portrait_animation"
  | "video_retalking";

export interface AvatarEngineState {
  engine: AvatarEngineChoice;
  mode: AvatarEngineModeChoice;
  avatarImageUrl: string | null;
  sourceVideoUrl: string | null;
  audioUrl: string | null;
  emotion: string;
  motionIntensity: number;
  consent: boolean;
}

export const INITIAL_AVATAR_ENGINE_STATE: AvatarEngineState = {
  engine: "off",
  mode: "auto",
  avatarImageUrl: null,
  sourceVideoUrl: null,
  audioUrl: null,
  emotion: "neutral",
  motionIntensity: 0.5,
  consent: false,
};

const ENGINE_OPTIONS: { value: AvatarEngineChoice; label: string }[] = [
  { value: "off", label: "Off — use standard render / lip-sync" },
  { value: "auto", label: "Auto (routed by goal)" },
  { value: "comfyui", label: "ComfyUI LatentSync (local, free)" },
  { value: "wav2lip", label: "Wav2Lip (self-hosted, free)" },
  { value: "latentsync", label: "LatentSync" },
  { value: "echomimic", label: "EchoMimic" },
  { value: "musetalk", label: "MuseTalk" },
  { value: "liveportrait", label: "LivePortrait" },
  { value: "videoretalking", label: "VideoReTalking" },
  { value: "mock", label: "Mock (simulated)" },
];

const MODE_OPTIONS: { value: AvatarEngineModeChoice; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "highest_quality", label: "Highest Quality Lip Sync" },
  { value: "fast_preview", label: "Fast Preview / Realtime" },
  { value: "expressive", label: "Expressive Avatar Motion" },
  { value: "portrait_animation", label: "Portrait Animation" },
  { value: "video_retalking", label: "Existing Video Retalking" },
];

const EMOTIONS = ["neutral", "happy", "serious", "sad", "excited"];

interface EngineInfo {
  id: string;
  name: string;
  configured: boolean;
}

function UploadField({
  id,
  label,
  accept,
  folder,
  value,
  onUploaded,
}: {
  id: string;
  label: string;
  accept: string;
  folder: string;
  value: string | null;
  onUploaded: (url: string | null) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleChange(file: File) {
    setBusy(true);
    setError(null);
    onUploaded(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const cleanName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${user.id}/${folder}/${crypto.randomUUID()}-${cleanName}`;
      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      onUploaded(
        supabase.storage.from("videos").getPublicUrl(path).data.publicUrl
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept={accept}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleChange(file);
        }}
      />
      {busy && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
        </p>
      )}
      {value && !busy && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" /> Uploaded
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * "Avatar Engine" section of the create page: engine mode + engine
 * selection, media uploads, emotion, motion intensity, and the likeness
 * consent gate. Script / language / aspect ratio come from the main form.
 */
export function AvatarEnginePanel({
  value,
  onChange,
}: {
  value: AvatarEngineState;
  onChange: (next: AvatarEngineState) => void;
}) {
  const [engines, setEngines] = React.useState<EngineInfo[]>([]);
  const enabled = value.engine !== "off";

  const set = React.useCallback(
    (patch: Partial<AvatarEngineState>) => onChange({ ...value, ...patch }),
    [value, onChange]
  );

  // Configured/simulated indicators for the dropdown.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/avatar-engine/engines")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { engines?: EngineInfo[] } | null) => {
        if (!cancelled && body?.engines) setEngines(body.engines);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function engineLabel(opt: { value: AvatarEngineChoice; label: string }) {
    const info = engines.find((e) => e.id === opt.value);
    if (!info || opt.value === "mock") return opt.label;
    return info.configured ? `${opt.label} ✓` : `${opt.label} (simulated)`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avatar Engine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="engine">Engine</Label>
          <Select
            id="engine"
            value={value.engine}
            onChange={(e) =>
              set({ engine: e.target.value as AvatarEngineChoice })
            }
          >
            {ENGINE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {engineLabel(opt)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Open-source animation engines. Engines without a configured
            endpoint run simulated jobs so you can test the flow.
          </p>
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="engine-mode">Engine Mode</Label>
              <Select
                id="engine-mode"
                value={value.mode}
                onChange={(e) =>
                  set({ mode: e.target.value as AvatarEngineModeChoice })
                }
              >
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <UploadField
              id="engine-avatar-image"
              label="Avatar image (portrait)"
              accept="image/*"
              folder="engine-images"
              value={value.avatarImageUrl}
              onUploaded={(url) => set({ avatarImageUrl: url })}
            />
            <UploadField
              id="engine-source-video"
              label="Source video (talking head)"
              accept="video/*"
              folder="engine-videos"
              value={value.sourceVideoUrl}
              onUploaded={(url) => set({ sourceVideoUrl: url })}
            />
            <UploadField
              id="engine-audio"
              label="Audio (optional — generated from script otherwise)"
              accept="audio/*"
              folder="engine-audio"
              value={value.audioUrl}
              onUploaded={(url) => set({ audioUrl: url })}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="engine-emotion">Emotion</Label>
                <Select
                  id="engine-emotion"
                  value={value.emotion}
                  onChange={(e) => set({ emotion: e.target.value })}
                >
                  {EMOTIONS.map((emotion) => (
                    <option key={emotion} value={emotion}>
                      {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="engine-motion">
                  Motion intensity: {Math.round(value.motionIntensity * 100)}%
                </Label>
                <input
                  id="engine-motion"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={value.motionIntensity}
                  onChange={(e) =>
                    set({ motionIntensity: Number(e.target.value) })
                  }
                  className="w-full accent-[hsl(var(--primary))]"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.consent}
                onChange={(e) => set({ consent: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
              />
              <span>
                I confirm I have permission to use this person&apos;s face,
                voice, likeness, and uploaded media.
              </span>
            </label>
          </>
        )}
      </CardContent>
    </Card>
  );
}
