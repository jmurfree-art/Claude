'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CardVideo } from '@/lib/types';

interface WatchlistButtonProps {
  video: CardVideo;
  initialSaved?: boolean;
  onChange?: (saved: boolean) => void;
  className?: string;
}

export function WatchlistButton({
  video,
  initialSaved = false,
  onChange,
  className,
}: WatchlistButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !saved;
    setSaved(next);
    onChange?.(next);
    setPending(true);

    try {
      const res = await fetch('/api/watchlist', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          next
            ? {
                video: {
                  id: video.key,
                  title: video.title,
                  url: video.url,
                  thumbnail: video.thumbnail ?? '',
                  channel: video.channel ?? '',
                  durationSec: video.durationSec,
                  viewCount: video.viewCount,
                },
              }
            : { videoId: video.key }
        ),
      });

      if (res.status === 401 || res.status === 503) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      if (!res.ok) {
        throw new Error('Watchlist request failed');
      }
    } catch {
      setSaved(!next);
      onChange?.(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-pressed={saved}
      aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
      onClick={toggle}
      disabled={pending}
      className={cn(className)}
    >
      <Heart className={cn('h-5 w-5', saved && 'fill-current text-red-500')} aria-hidden="true" />
    </Button>
  );
}
