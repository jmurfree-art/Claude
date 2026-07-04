"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Save, ShieldAlert, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ASPECT_RATIOS,
  BACKGROUNDS,
  LANGUAGES,
  MAX_SCRIPT_LENGTH,
} from "@/lib/constants";
import {
  AvatarEnginePanel,
  INITIAL_AVATAR_ENGINE_STATE,
  type AvatarEngineState,
} from "@/components/avatar-engine-panel";
import { deleteDraft, getDraft, saveDraft } from "@/lib/offline/drafts";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AspectRatio, Avatar, Voice } from "@/lib/video-providers/types";

type LipSyncEngineChoice = "off" | "auto" | "heygen" | "replicate" | "fal" | "mock";

const LIPSYNC_ENGINE_OPTIONS: { value: LipSyncEngineChoice; label: string }[] = [
  { value: "off", label: "Off — standard render" },
  { value: "auto", label: "Auto (best available)" },
  { value: "heygen", label: "HeyGen" },
  { value: "replicate", label: "Replicate" },
  { value: "fal", label: "fal MuseTalk" },
  { value: "mock", label: "Mock (simulated)" },
];

interface CatalogState {
  avatars: Avatar[];
  voices: Voice[];
  loading: boolean;
  error: string | null;
}

export function CreateVideoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");

  const [catalog, setCatalog] = React.useState<CatalogState>({
    avatars: [],
    voices: [],
    loading: true,
    error: null,
  });

  const [title, setTitle] = React.useState("");
  const [script, setScript] = React.useState("");
  const [language, setLanguage] = React.useState("en");
  const [avatarId, setAvatarId] = React.useState<string>("");
  const [voiceId, setVoiceId] = React.useState<string>("");
  const [backgroundId, setBackgroundId] = React.useState(BACKGROUNDS[0].id);
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatio>("16:9");
  const [consent, setConsent] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const [draftId, setDraftId] = React.useState<string | null>(null);
  const [draftSaved, setDraftSaved] = React.useState(false);

  // Lip-sync pipeline options.
  const [lipsyncEngine, setLipsyncEngine] =
    React.useState<LipSyncEngineChoice>("off");
  const [useSourceVideo, setUseSourceVideo] = React.useState(false);
  const [sourceUrl, setSourceUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [likenessConsent, setLikenessConsent] = React.useState(false);

  // Avatar-engine pipeline (open-source animation engines).
  const [engineState, setEngineState] = React.useState<AvatarEngineState>(
    INITIAL_AVATAR_ENGINE_STATE
  );
  const engineActive = engineState.engine !== "off";
  const lipsyncEnabled = !engineActive && lipsyncEngine !== "off";

  async function handleSourceUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    setSourceUrl(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const cleanName = file.name.replace(/[^\w.-]+/g, "_");
      const storagePath = `${user.id}/sources/${crypto.randomUUID()}-${cleanName}`;
      const { error } = await supabase.storage
        .from("videos")
        .upload(storagePath, file, { contentType: file.type, upsert: true });
      if (error) throw new Error(error.message);

      setSourceUrl(
        supabase.storage.from("videos").getPublicUrl(storagePath).data.publicUrl
      );
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed — try again."
      );
    } finally {
      setUploading(false);
    }
  }

  // Resume a locally stored draft (?draft=<id>) — works fully offline.
  React.useEffect(() => {
    if (!draftParam) return;
    void getDraft(draftParam).then((draft) => {
      if (!draft) return;
      setDraftId(draft.id);
      setTitle(draft.title);
      setScript(draft.script);
      setLanguage(draft.language);
      if (draft.avatarId) setAvatarId(draft.avatarId);
      if (draft.voiceId) setVoiceId(draft.voiceId);
      setBackgroundId(draft.backgroundId);
      setAspectRatio(draft.aspectRatio);
    });
  }, [draftParam]);

  async function handleSaveDraft() {
    const saved = await saveDraft({
      id: draftId ?? undefined,
      title,
      script,
      language,
      avatarId,
      voiceId,
      backgroundId,
      aspectRatio,
    });
    setDraftId(saved.id);
    setDraftSaved(true);
    window.setTimeout(() => setDraftSaved(false), 2500);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [avatarsRes, voicesRes] = await Promise.all([
          fetch("/api/avatars"),
          fetch("/api/voices"),
        ]);
        if (!avatarsRes.ok || !voicesRes.ok) {
          throw new Error("Failed to load avatars or voices from the provider.");
        }
        const { avatars } = (await avatarsRes.json()) as { avatars: Avatar[] };
        const { voices } = (await voicesRes.json()) as { voices: Voice[] };
        if (cancelled) return;
        setCatalog({ avatars, voices, loading: false, error: null });
        if (avatars.length > 0) setAvatarId(avatars[0].id);
      } catch (err) {
        if (cancelled) return;
        setCatalog((c) => ({
          ...c,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load catalog.",
        }));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const languageLabel =
    LANGUAGES.find((l) => l.code === language)?.label ?? "English";

  const voicesForLanguage = React.useMemo(
    () =>
      catalog.voices.filter((v) =>
        v.language.toLowerCase().includes(languageLabel.toLowerCase())
      ),
    [catalog.voices, languageLabel]
  );

  // Keep the selected voice valid when the language changes.
  React.useEffect(() => {
    if (!voicesForLanguage.some((v) => v.id === voiceId)) {
      setVoiceId(voicesForLanguage[0]?.id ?? "");
    }
  }, [voicesForLanguage, voiceId]);

  const canSubmit =
    !submitting &&
    !uploading &&
    script.trim().length > 0 &&
    script.length <= MAX_SCRIPT_LENGTH &&
    consent &&
    // Avatar-engine jobs don't use the provider avatar/voice catalog.
    (engineActive || (!catalog.loading && avatarId !== "" && voiceId !== "")) &&
    // Lip-sync requires explicit likeness permission.
    (!lipsyncEnabled || likenessConsent) &&
    // Avatar engines require the media/likeness consent in their panel.
    (!engineActive || engineState.consent);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const background = BACKGROUNDS.find((b) => b.id === backgroundId)!;
    const avatar = catalog.avatars.find((a) => a.id === avatarId);
    const voice = catalog.voices.find((v) => v.id === voiceId);

    try {
      // Avatar-engine pipeline: one call creates the project + engine job.
      if (engineActive) {
        const res = await fetch("/api/avatar-engine/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim() || "Untitled avatar video",
            script: script.trim(),
            language,
            aspectRatio,
            engine: engineState.engine,
            mode: engineState.mode,
            avatarImageUrl: engineState.avatarImageUrl,
            sourceVideoUrl: engineState.sourceVideoUrl,
            audioUrl: engineState.audioUrl,
            emotion: engineState.emotion,
            motionIntensity: engineState.motionIntensity,
            consent: engineState.consent,
          }),
        });
        const body = (await res.json()) as {
          projectId?: string;
          error?: string;
        };
        if (!res.ok || !body.projectId) {
          throw new Error(body.error ?? "Avatar engine job failed to start.");
        }
        if (draftId) void deleteDraft(draftId);
        router.push(`/projects/${body.projectId}`);
        return;
      }
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Untitled video",
          script: script.trim(),
          avatarId,
          avatarName: avatar?.name ?? null,
          voiceId,
          voiceName: voice?.name ?? null,
          language,
          aspectRatio,
          backgroundColor: background.value,
          lipsync: lipsyncEnabled,
          consent,
        }),
      });
      const body = (await res.json()) as {
        projectId?: string;
        error?: string;
      };
      if (!res.ok || !body.projectId) {
        throw new Error(body.error ?? "Video generation failed to start.");
      }

      // Lip-sync pipeline: hand audio generation + face source to the
      // lip-sync provider for the freshly created project.
      if (lipsyncEnabled) {
        const lipsyncRes = await fetch("/api/lipsync/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: body.projectId,
            engine: lipsyncEngine,
            avatarImageUrl: !useSourceVideo ? sourceUrl : null,
            sourceVideoUrl: useSourceVideo ? sourceUrl : null,
            consent: likenessConsent,
          }),
        });
        const lipsyncBody = (await lipsyncRes.json()) as { error?: string };
        if (!lipsyncRes.ok) {
          throw new Error(
            lipsyncBody.error ?? "The lip-sync job failed to start."
          );
        }
      }

      // The render is queued — the local draft has served its purpose.
      if (draftId) void deleteDraft(draftId);
      router.push(`/projects/${body.projectId}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong."
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {catalog.error && (
          <Alert variant="warning">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Provider unavailable</AlertTitle>
            <AlertDescription>
              {catalog.error} You can still write your script and save it as a
              local draft — generate once you&apos;re back online.
            </AlertDescription>
          </Alert>
        )}
        {/* Script */}
        <Card>
          <CardHeader>
            <CardTitle>Script</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Product intro — June launch"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="script">What should the avatar say?</Label>
              <Textarea
                id="script"
                placeholder="Type or paste your script here…"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={8}
                maxLength={MAX_SCRIPT_LENGTH}
                required
              />
              <p className="text-right text-xs text-muted-foreground">
                {script.length} / {MAX_SCRIPT_LENGTH}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Avatar picker */}
        <Card>
          <CardHeader>
            <CardTitle>Avatar</CardTitle>
          </CardHeader>
          <CardContent>
            {catalog.loading ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            ) : catalog.error ? (
              <p className="text-sm text-muted-foreground">
                Avatars can&apos;t be loaded right now — reconnect to pick one.
              </p>
            ) : (
              <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
                {catalog.avatars.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setAvatarId(avatar.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border-2 transition-colors",
                      avatarId === avatar.id
                        ? "border-primary ring-1 ring-primary"
                        : "border-transparent hover:border-muted-foreground/30"
                    )}
                    title={avatar.name}
                  >
                    <div className="aspect-square bg-muted">
                      {avatar.previewImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar.previewImageUrl}
                          alt={avatar.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                          {avatar.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <p className="truncate bg-background/90 px-1.5 py-1 text-center text-xs">
                      {avatar.name}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Settings column */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Voice & language</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice">Voice</Label>
              {catalog.loading ? (
                <Skeleton className="h-9 w-full" />
              ) : voicesForLanguage.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No voices available for {languageLabel}. Try another language.
                </p>
              ) : (
                <Select
                  id="voice"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                >
                  {voicesForLanguage.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.gender ? ` (${v.gender})` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Look</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Background</Label>
              <div className="flex flex-wrap gap-2">
                {BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackgroundId(bg.id)}
                    title={bg.label}
                    className={cn(
                      "h-8 w-8 rounded-full border shadow-sm transition-transform",
                      backgroundId === bg.id
                        ? "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "hover:scale-105"
                    )}
                    style={{ backgroundColor: bg.value }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Aspect ratio</Label>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() => setAspectRatio(ratio.value)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-center text-sm transition-colors",
                      aspectRatio === ratio.value
                        ? "border-primary bg-primary/10 font-medium"
                        : "hover:bg-accent"
                    )}
                  >
                    <span className="block">{ratio.label}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {ratio.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Avatar engine (open-source animation) */}
        <AvatarEnginePanel value={engineState} onChange={setEngineState} />

        {/* Lip sync */}
        {!engineActive && (
        <Card>
          <CardHeader>
            <CardTitle>Lip sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lipsync-engine">Lip Sync Engine</Label>
              <Select
                id="lipsync-engine"
                value={lipsyncEngine}
                onChange={(e) =>
                  setLipsyncEngine(e.target.value as LipSyncEngineChoice)
                }
              >
                {LIPSYNC_ENGINE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Animates the presenter&apos;s mouth to match the generated
                voice. Auto picks the first configured engine.
              </p>
            </div>

            {lipsyncEnabled && (
              <>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useSourceVideo}
                    onChange={(e) => {
                      setUseSourceVideo(e.target.checked);
                      setSourceUrl(null);
                      setUploadError(null);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                  />
                  <span>Use source video instead of still avatar</span>
                </label>

                <div className="space-y-2">
                  <Label htmlFor="lipsync-source">
                    {useSourceVideo
                      ? "Talking-head source video"
                      : "Avatar image (optional — stock avatar used otherwise)"}
                  </Label>
                  <Input
                    id="lipsync-source"
                    type="file"
                    accept={useSourceVideo ? "video/*" : "image/*"}
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleSourceUpload(file);
                    }}
                  />
                  {uploading && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                    </p>
                  )}
                  {sourceUrl && !uploading && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3 w-3" /> Uploaded
                    </p>
                  )}
                  {uploadError && (
                    <p className="text-xs text-destructive">{uploadError}</p>
                  )}
                </div>

                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={likenessConsent}
                    onChange={(e) => setLikenessConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                  />
                  <span>
                    I have permission to use this person&apos;s image, voice,
                    and likeness.
                  </span>
                </label>
              </>
            )}
          </CardContent>
        </Card>
        )}

        {/* Consent + submit */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Alert variant="warning">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Consent & responsible use</AlertTitle>
              <AlertDescription>
                Only generate videos with avatars and voices you have the right
                to use. Custom avatars or cloned voices require documented
                consent from the person depicted. Impersonating real people is
                prohibited and scripts are checked before generation.
              </AlertDescription>
            </Alert>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
              />
              <span>
                I confirm I have the rights and any required consent for this
                content, and it does not impersonate a real person.
              </span>
            </label>

            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleSaveDraft}
              disabled={!title.trim() && !script.trim()}
            >
              {draftSaved ? (
                <>
                  <Check />
                  Saved on this device
                </>
              ) : (
                <>
                  <Save />
                  Save draft (works offline)
                </>
              )}
            </Button>

            <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Starting render…
                </>
              ) : (
                <>
                  <Sparkles />
                  Generate video
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
