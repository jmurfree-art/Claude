import { createServerSupabase } from '@/lib/supabase/server';
import { LibraryClient } from '@/components/LibraryClient';
import type { VideoRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  let videos: VideoRow[] = [];

  try {
    const supabase = createServerSupabase();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (user) {
      const { data } = await supabase
        .from('videos')
        .select('*')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      videos = (data ?? []) as VideoRow[];
    }
  } catch {
    videos = [];
  }

  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Library</h1>
      <LibraryClient videos={videos} />
    </div>
  );
}
