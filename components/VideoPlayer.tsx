'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { VideoRow } from '@/lib/types';

interface VideoPlayerProps {
  video: Pick<VideoRow, 'id' | 'kind' | 'external_url' | 'title'>;
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1);
      return id || null;
    }
    if (u.hostname.includes('youtube.com') && u.pathname === '/watch') {
      return u.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoPlayer({ video }: VideoPlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const loadSignedUrl = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch(`/api/videos/${video.id}/signed-url`);
      if (!res.ok) throw new Error('Could not load video');
      const data = (await res.json()) as { url: string; expiresAt: string };
      setSignedUrl(data.url);
      setExpiresAt(data.expiresAt);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load video');
    } finally {
      fetchingRef.current = false;
    }
  }, [video.id]);

  useEffect(() => {
    if (video.kind !== 'upload') return;
    void loadSignedUrl();
  }, [video.kind, loadSignedUrl]);

  function handlePlay() {
    if (video.kind !== 'upload') return;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      void loadSignedUrl();
    }
  }

  if (video.kind === 'upload') {
    return (
      <div className="space-y-3">
        {signedUrl ? (
          <video
            controls
            preload="metadata"
            className="w-full aspect-video bg-black rounded-lg"
            src={signedUrl}
            onPlay={handlePlay}
          />
        ) : error ? (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          <div className="flex aspect-video w-full animate-pulse items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            Loading video…
          </div>
        )}
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Open original
          </a>
        ) : (
          <span className="text-sm text-muted-foreground/60">Open original</span>
        )}
      </div>
    );
  }

  const externalUrl = video.external_url;
  if (!externalUrl) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No media attached
      </div>
    );
  }

  const youTubeId = extractYouTubeId(externalUrl);

  return (
    <div className="space-y-3">
      {youTubeId ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youTubeId}`}
          title={video.title}
          className="aspect-video w-full rounded-lg border"
          loading="lazy"
          allowFullScreen
        />
      ) : (
        <iframe
          src={externalUrl}
          title={video.title}
          className="aspect-video w-full rounded-lg border"
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
      )}
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Open original
      </a>
    </div>
  );
}
