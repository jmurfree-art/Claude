// Shared types for WatchDeck. This file is the cross-module contract —
// keep API routes, components, and lib helpers in sync with it.

/** Normalized YouTube search/metadata result produced by lib/ytdlp.ts */
export interface YouTubeResult {
  id: string; // 11-char YouTube video id
  title: string;
  url: string; // https://www.youtube.com/watch?v=<id>
  thumbnail: string;
  channel: string;
  durationSec: number | null;
  viewCount: number | null;
}

/** Row shape of public.videos (snake_case, mirrors Postgres) */
export interface VideoRow {
  id: string; // uuid
  kind: 'youtube' | 'upload' | 'link';
  external_id: string | null;
  storage_path: string | null;
  external_url: string | null;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  channel: string | null;
  owner_id: string | null;
  tags: string[];
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Frozen snapshot stored in watchlist.snapshot */
export interface WatchlistSnapshot {
  videoId: string; // YouTube external id or videos.id for user content
  title: string;
  thumbnail: string;
  channel: string;
  durationSec: number | null;
  url: string;
}

export interface WatchlistItem {
  video_id: string; // uuid of public.videos row
  snapshot: WatchlistSnapshot;
  added_at: string;
  unavailable?: boolean;
}

/** Card-friendly union used by ResultCard for both YouTube + user videos */
export interface CardVideo {
  /** YouTube external id for kind=youtube, else videos.id uuid */
  key: string;
  kind: 'youtube' | 'upload' | 'link';
  title: string;
  url: string; // watch link (YouTube URL, /v/<id>, or external URL)
  thumbnail: string | null;
  channel: string | null;
  durationSec: number | null;
  viewCount: number | null;
}

export interface SummarizeResponse {
  summary: string;
  source: 'captions' | 'description';
}

export interface SearchResponse {
  results: YouTubeResult[];
  page: number;
  hasMore: boolean;
}

export function youTubeResultToCard(r: YouTubeResult): CardVideo {
  return {
    key: r.id,
    kind: 'youtube',
    title: r.title,
    url: r.url,
    thumbnail: r.thumbnail || null,
    channel: r.channel || null,
    durationSec: r.durationSec,
    viewCount: r.viewCount,
  };
}

export function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(r).padStart(2, '0')}`;
}

export function formatViews(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B views`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}
