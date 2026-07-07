import { notFound } from 'next/navigation';

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { VideoForm } from '@/components/VideoForm';
import type { VideoRow } from '@/lib/types';

interface EditPageProps {
  params: { id: string };
}

function tryCreateSupabase() {
  try {
    return createServerSupabase();
  } catch {
    return null;
  }
}

export default async function EditPage({ params }: EditPageProps) {
  const supabase = tryCreateSupabase();
  if (!supabase) notFound();

  const user = await getSessionUser();
  if (!user) notFound();

  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();

  if (error || !data) notFound();

  const video = data as VideoRow;
  if (video.owner_id !== user.id) notFound();

  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Edit video</h1>
      <VideoForm mode="edit" initial={video} videoId={video.id} />
    </div>
  );
}
