import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

import { Badge } from '@/components/ui/badge';
import { VideoPlayer } from '@/components/VideoPlayer';
import { createAdminSupabase, createServerSupabase } from '@/lib/supabase/server';
import type { VideoRow } from '@/lib/types';

interface VideoPageProps {
  params: { id: string };
}

function getClient() {
  try {
    return createAdminSupabase();
  } catch {
    try {
      return createServerSupabase();
    } catch {
      return null;
    }
  }
}

export default async function VideoPage({ params }: VideoPageProps) {
  const supabase = getClient();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('id', params.id)
    .is('deleted_at', null)
    .in('kind', ['upload', 'link'])
    .single();

  if (error || !data) notFound();

  const video = data as VideoRow;

  return (
    <article className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-semibold">{video.title}</h1>

      <VideoPlayer
        video={{ id: video.id, kind: video.kind, external_url: video.external_url, title: video.title }}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{video.owner_id ? `Uploaded by ${video.owner_id.slice(0, 8)}…` : 'Anonymous'}</span>
        <span>{new Date(video.created_at).toLocaleDateString()}</span>
      </div>

      {video.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {video.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {video.description ? (
        <div className="text-sm leading-relaxed [&_p]:mb-3 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded">
          <ReactMarkdown>{video.description}</ReactMarkdown>
        </div>
      ) : null}
    </article>
  );
}
