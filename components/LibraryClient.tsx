'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import type { VideoRow } from '@/lib/types';

interface LibraryClientProps {
  videos: VideoRow[];
}

export function LibraryClient({ videos: initialVideos }: LibraryClientProps) {
  const [videos, setVideos] = useState(initialVideos);

  async function handleDelete(video: VideoRow) {
    if (!window.confirm(`Delete "${video.title}"? This cannot be undone.`)) return;
    const prev = videos;
    setVideos((v) => v.filter((x) => x.id !== video.id));
    try {
      const res = await fetch(`/api/videos/${video.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    } catch {
      setVideos(prev);
    }
  }

  if (videos.length === 0) {
    return (
      <EmptyState icon={FolderOpen} title="Your library is empty">
        <div className="mt-2 flex gap-3">
          <Button asChild variant="outline" className="h-11">
            <Link href="/upload">Upload a video</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/create">Add a link</Link>
          </Button>
        </div>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {videos.map((video) => (
        <div
          key={video.id}
          className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
        >
          <div className="h-24 w-full flex-shrink-0 overflow-hidden rounded-md bg-muted sm:w-[96px]">
            {video.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.thumbnail_url} alt={video.title} className="h-full w-full object-cover" />
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-1">
            <p className="font-medium">{video.title}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{video.kind}</Badge>
              {video.status !== 'ready' ? <Badge variant="outline">{video.status}</Badge> : null}
              <span className="text-xs text-muted-foreground">
                {new Date(video.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" className="h-11">
              <Link href={`/v/${video.id}`}>View</Link>
            </Button>
            <Button asChild variant="outline" className="h-11">
              <Link href={`/edit/${video.id}`}>Edit</Link>
            </Button>
            <Button type="button" variant="destructive" className="h-11" onClick={() => handleDelete(video)}>
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
