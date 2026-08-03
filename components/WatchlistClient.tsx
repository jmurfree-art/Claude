'use client';

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';

import { VideoGrid } from '@/components/VideoGrid';
import { ResultCard } from '@/components/ResultCard';
import { EmptyState } from '@/components/EmptyState';
import type { CardVideo, WatchlistItem } from '@/lib/types';

interface WatchlistClientProps {
  items: WatchlistItem[];
}

interface Entry {
  videoId: string; // videos.id uuid
  card: CardVideo;
  unavailable: boolean;
}

const CHUNK_SIZE = 12;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function buildEntries(items: WatchlistItem[]): Entry[] {
  return items.map((item) => ({
    videoId: item.video_id,
    card: {
      key: item.snapshot.videoId,
      kind: 'youtube',
      title: item.snapshot.title,
      url: item.snapshot.url,
      thumbnail: item.snapshot.thumbnail || null,
      channel: item.snapshot.channel || null,
      durationSec: item.snapshot.durationSec,
      viewCount: null,
    },
    unavailable: false,
  }));
}

export function WatchlistClient({ items }: WatchlistClientProps) {
  const [entries, setEntries] = useState<Entry[]>(() => buildEntries(items));

  useEffect(() => {
    const ytIds = entries.map((e) => e.card.key);
    if (ytIds.length === 0) return;
    let cancelled = false;

    (async () => {
      for (const batch of chunk(ytIds, CHUNK_SIZE)) {
        try {
          const res = await fetch(`/api/validate?ids=${encodeURIComponent(batch.join(','))}`);
          if (!res.ok) continue;
          const data = (await res.json()) as { available: Record<string, boolean> };
          if (cancelled) return;
          setEntries((prev) =>
            prev.map((e) =>
              batch.includes(e.card.key) ? { ...e, unavailable: data.available[e.card.key] === false } : e
            )
          );
        } catch {
          // Validation failure; leave entries as-is.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only re-run when the initial id list changes shape, not on every entry mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function handleRemove(videoId: string) {
    const prevEntries = entries;
    setEntries((prev) => prev.filter((e) => e.videoId !== videoId));
    try {
      const res = await fetch('/api/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });
      if (!res.ok) throw new Error('Failed to remove');
    } catch {
      setEntries(prevEntries);
    }
  }

  if (entries.length === 0) {
    return <EmptyState icon={Heart} title="Your watchlist is empty — search and tap the heart" />;
  }

  return (
    <VideoGrid>
      {entries.map((entry) => (
        <ResultCard
          key={entry.videoId}
          video={entry.card}
          saved
          unavailable={entry.unavailable}
          onRemove={() => handleRemove(entry.videoId)}
        />
      ))}
    </VideoGrid>
  );
}
