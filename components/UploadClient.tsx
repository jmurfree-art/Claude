'use client';

import { useRef, useState } from 'react';
import { Upload as UploadIcon } from 'lucide-react';
import { Upload as TusUpload } from 'tus-js-client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { VideoRow } from '@/lib/types';

const ALLOWED_EXTENSIONS = ['mp4', 'webm', 'mov'];
const MAX_SIZE_BYTES = 500 * 1024 * 1024;

type Phase = 'idle' | 'uploading' | 'success' | 'error';

export function UploadClient() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [createdVideoId, setCreatedVideoId] = useState<string | null>(null);

  const uploadRef = useRef<TusUpload | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function validateFile(f: File): string | null {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type .${ext}. Use mp4, webm, or mov.`;
    }
    if (f.size > MAX_SIZE_BYTES) {
      return 'File is too large. Maximum size is 500MB.';
    }
    return null;
  }

  function handleFile(f: File) {
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^./]+$/, ''));
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setError(null);

    const supabase = createBrowserSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      window.location.href = `/login?next=${encodeURIComponent('/upload')}`;
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
    const objectName = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

    setPhase('uploading');
    setProgress(0);

    const upload = new TusUpload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'user-videos',
        objectName,
        contentType: file.type || 'video/mp4',
        cacheControl: '3600',
      },
      onProgress(bytesUploaded, bytesTotal) {
        setProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onError(err) {
        setPhase('error');
        setError(err.message || 'Upload failed');
      },
      onSuccess: async () => {
        try {
          const res = await fetch('/api/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'upload',
              title: title.trim() || file.name,
              description: description.trim() || undefined,
              storage_path: objectName,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Failed to save video' }));
            throw new Error(typeof body.error === 'string' ? body.error : 'Failed to save video');
          }
          const data = (await res.json()) as { video: VideoRow };
          setCreatedVideoId(data.video.id);
          setPhase('success');
        } catch (err) {
          setPhase('error');
          setError(err instanceof Error ? err.message : 'Failed to save video');
        }
      },
    });

    uploadRef.current = upload;
    upload.start();
  }

  function handleCancel() {
    uploadRef.current?.abort();
    uploadRef.current = null;
    setPhase('idle');
    setProgress(0);
  }

  if (phase === 'success' && createdVideoId) {
    return (
      <div className="flex max-w-xl flex-col gap-4 rounded-lg border border-border p-6">
        <p className="text-sm font-medium">Upload complete.</p>
        <div className="flex gap-4">
          <a href={`/v/${createdVideoId}`} className="text-sm underline underline-offset-4">
            View video
          </a>
          <a href="/library" className="text-sm underline underline-offset-4">
            Go to library
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upload-title">Title</Label>
        <Input
          id="upload-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upload-description">Description</Label>
        <Textarea
          id="upload-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive ? 'border-primary bg-accent' : 'border-border'
        }`}
      >
        <UploadIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        {file ? (
          <p className="text-sm">{file.name}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Drag and drop a video, or</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button type="button" variant="outline" className="h-11" onClick={() => inputRef.current?.click()}>
          Choose file
        </Button>
        <p className="text-xs text-muted-foreground">MP4, WebM, or MOV up to 500MB</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {phase === 'uploading' ? (
        <div className="flex flex-col gap-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{progress}%</span>
            <Button type="button" variant="ghost" className="h-8" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" className="h-11" onClick={handleUpload} disabled={!file || !title.trim()}>
          Upload
        </Button>
      )}
    </div>
  );
}
