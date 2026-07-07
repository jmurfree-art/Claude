'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { VideoRow } from '@/lib/types';

interface VideoFormProps {
  mode: 'create' | 'edit';
  initial?: Partial<VideoRow>;
  videoId?: string;
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseTags(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(',')) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function VideoForm({ mode, initial, videoId }: VideoFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [externalUrl, setExternalUrl] = useState(initial?.external_url ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnail_url ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUpload = mode === 'edit' && initial?.kind === 'upload';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    if (!isUpload && externalUrl.trim() && !isValidUrl(externalUrl.trim())) {
      setError('External URL must be a valid http(s) URL.');
      return;
    }
    if (thumbnailUrl.trim() && !isValidUrl(thumbnailUrl.trim())) {
      setError('Thumbnail URL must be a valid http(s) URL.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        description: description.trim() || undefined,
        tags: parseTags(tags),
        thumbnail_url: thumbnailUrl.trim() || undefined,
      };
      if (!isUpload) {
        payload.external_url = externalUrl.trim() || undefined;
      }

      const res =
        mode === 'create'
          ? await fetch('/api/videos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payload, kind: 'link' }),
            })
          : await fetch(`/api/videos/${videoId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Something went wrong' }));
        throw new Error(typeof body.error === 'string' ? body.error : 'Something went wrong');
      }

      router.push('/library');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
        />
        <p className="text-xs text-muted-foreground">Markdown supported</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comedy, tutorial, music"
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">Comma-separated</p>
      </div>

      {isUpload ? (
        <div className="flex flex-col gap-1.5">
          <Label>Source file</Label>
          <p className="text-sm text-muted-foreground">Uploaded file — file replacement coming soon</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="external_url">External URL (optional)</Label>
          <Input
            id="external_url"
            type="url"
            value={externalUrl ?? ''}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://…"
            className="h-11"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="thumbnail_url">Thumbnail URL (optional)</Label>
        <Input
          id="thumbnail_url"
          type="url"
          value={thumbnailUrl ?? ''}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://…"
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">v1 supports thumbnail URLs only, not file uploads.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" className="h-11" disabled={submitting}>
        {submitting ? 'Saving…' : mode === 'create' ? 'Create video' : 'Save changes'}
      </Button>
    </form>
  );
}
