import { UploadClient } from '@/components/UploadClient';

export default function UploadPage() {
  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Upload a video</h1>
      <UploadClient />
    </div>
  );
}
