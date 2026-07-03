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
import { deleteDraft, getDraft, saveDraft } from "@/lib/offline/drafts";
import { cn } from "@/lib/utils";
import type { AspectRatio, Avatar, Voice } from "@/lib/video-providers/types";

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
    !catalog.loading &&
    script.trim().length > 0 &&
    script.length <= MAX_SCRIPT_LENGTH &&
    avatarId !== "" &&
    voiceId !== "" &&
    consent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const background = BACKGROUNDS.find((b) => b.id === backgroundId)!;
    const avatar = catalog.avatars.find((a) => a.id === avatarId);
    const voice = catalog.voices.find((v) => v.id === voiceId);

    try {
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
