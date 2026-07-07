import { VideoForm } from '@/components/VideoForm';

export default function CreatePage() {
  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Add a video link</h1>
      <VideoForm mode="create" />
    </div>
  );
}
