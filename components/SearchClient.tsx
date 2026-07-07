'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { VideoGrid } from '@/components/VideoGrid';
import { ResultCard } from '@/components/ResultCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { youTubeResultToCard, type CardVideo, type SearchResponse, type WatchlistItem } from '@/lib/types';

type Phase = 'idle' | 'loading' | 'error' | 'empty' | 'results';

export function SearchClient() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<CardVideo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [appending, setAppending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let ignore = false;
    fetch('/api/watchlist')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items: WatchlistItem[] } | null) => {
        if (ignore || !data) return;
        setSavedIds(new Set(data.items.map((item) => item.snapshot.videoId)));
      })
      .catch(() => {
        // Not logged in or Supabase unavailable; ignore.
      });
    return () => {
      ignore = true;
    };
  }, []);

  const runSearch = useCallback(async (q: string, pageNum: number, append: boolean) => {
    const requestId = ++requestIdRef.current;
    if (append) setAppending(true);
    else setPhase('loading');

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&page=${pageNum}`);
      if (requestId !== requestIdRef.current) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Search failed' }));
        throw new Error(typeof body.error === 'string' ? body.error : 'Search failed');
      }

      const data = (await res.json()) as SearchResponse;
      if (requestId !== requestIdRef.current) return;

      const cards = data.results.map(youTubeResultToCard);
      setResults((prev) => (append ? [...prev, ...cards] : cards));
      setHasMore(data.hasMore);
      setPage(pageNum);
      setPhase(!append && cards.length === 0 ? 'empty' : 'results');
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : 'Search failed');
      if (!append) setPhase('error');
    } finally {
      if (requestId === requestIdRef.current) setAppending(false);
    }
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSubmittedQuery(q);
    setResults([]);
    void runSearch(q, 1, false);
  }

  function handleRetry() {
    if (!submittedQuery) return;
    void runSearch(submittedQuery, 1, false);
  }

  useEffect(() => {
    if (!submittedQuery || !hasMore || phase !== 'results') return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !appending) {
          void runSearch(submittedQuery, page + 1, true);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [submittedQuery, hasMore, phase, appending, page, runSearch]);

  return (
    <div className="flex flex-col gap-6 py-6">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search YouTube…"
          aria-label="Search YouTube"
          className="h-11"
        />
        <Button type="submit" className="h-11">
          <SearchIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          Search
        </Button>
      </form>

      {phase === 'idle' && (
        <EmptyState
          icon={SearchIcon}
          title="Search YouTube"
          hint="Find videos, save them to your watchlist, and get quick AI summaries."
        />
      )}

      {phase === 'loading' && (
        <VideoGrid>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </VideoGrid>
      )}

      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-destructive">{errorMessage}</p>
          <Button type="button" variant="outline" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      )}

      {phase === 'empty' && submittedQuery && (
        <EmptyState title={`No results for "${submittedQuery}"`} hint="Try a different search term." />
      )}

      {phase === 'results' && (
        <>
          <VideoGrid>
            {results.map((video) => (
              <ResultCard key={video.key} video={video} saved={savedIds.has(video.key)} showSummarize />
            ))}
          </VideoGrid>
          {appending && (
            <VideoGrid>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={`append-${i}`} />
              ))}
            </VideoGrid>
          )}
          {hasMore ? <div ref={sentinelRef} className="h-4 w-full" /> : null}
        </>
      )}
    </div>
  );
}
