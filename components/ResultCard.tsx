'use client';

import { useState } from 'react';
import { Sparkles, Video as VideoIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WatchlistButton } from '@/components/WatchlistButton';
import { SummarizeSheet } from '@/components/SummarizeSheet';
import { formatDuration, formatViews, type CardVideo } from '@/lib/types';

interface ResultCardProps {
  video: CardVideo;
  saved?: boolean;
  onRemove?: () => void;
  unavailable?: boolean;
  showSummarize?: boolean;
}

export function ResultCard({ video, saved, onRemove, unavailable, showSummarize }: ResultCardProps) {
  const [embedded, setEmbedded] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);

  const duration = formatDuration(video.durationSec);
  const views = formatViews(video.viewCount);
  const metaLine = [video.channel, views].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-muted">
        {unavailable ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-destructive/90 p-3 text-center text-destructive-foreground">
            <p className="text-sm font-medium">Video unavailable</p>
            {onRemove ? (
              <Button type="button" size="sm" variant="secondary" className="h-8" onClick={onRemove}>
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}

        {embedded && video.kind === 'youtube' ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.key}`}
            title={video.title}
            className="aspect-video w-full"
            loading="lazy"
            allowFullScreen
          />
        ) : video.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail} alt={video.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <VideoIcon className="h-8 w-8" aria-hidden="true" />
          </div>
        )}

        {duration && !embedded && !unavailable ? (
          <Badge className="absolute bottom-2 right-2 z-10" variant="secondary">
            {duration}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 font-medium">{video.title}</p>
        {metaLine ? <p className="text-sm text-muted-foreground">{metaLine}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 pt-0">
        <Button asChild variant="secondary" className="h-11">
          <a href={video.url} target="_blank" rel="noopener noreferrer">
            Watch
          </a>
        </Button>

        {video.kind === 'youtube' ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setEmbedded((v) => !v)}
            aria-pressed={embedded}
          >
            {embedded ? 'Hide' : 'Embed'}
          </Button>
        ) : null}

        {video.kind === 'youtube' ? <WatchlistButton video={video} initialSaved={saved} /> : null}

        {showSummarize && video.kind === 'youtube' ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Summarize"
            onClick={() => setSummarizeOpen(true)}
          >
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {showSummarize && video.kind === 'youtube' ? (
        <SummarizeSheet
          videoId={video.key}
          title={video.title}
          open={summarizeOpen}
          onOpenChange={setSummarizeOpen}
        />
      ) : null}
    </div>
  );
}
