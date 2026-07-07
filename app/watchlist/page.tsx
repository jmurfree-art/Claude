import { createServerSupabase } from '@/lib/supabase/server';
import { WatchlistClient } from '@/components/WatchlistClient';
import { EmptyState } from '@/components/EmptyState';
import type { WatchlistItem } from '@/lib/types';

export default async function WatchlistPage() {
  let items: WatchlistItem[] = [];
  let configError = false;

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('watchlist')
      .select('video_id, snapshot, added_at')
      .order('added_at', { ascending: false });
    if (error) throw error;
    items = (data ?? []) as unknown as WatchlistItem[];
  } catch {
    configError = true;
  }

  if (configError) {
    return (
      <div className="py-8">
        <h1 className="mb-6 text-2xl font-semibold">Watchlist</h1>
        <EmptyState
          title="Supabase not configured"
          hint="Set up your environment variables to use the watchlist."
        />
      </div>
    );
  }

  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Watchlist</h1>
      <WatchlistClient items={items} />
    </div>
  );
}
