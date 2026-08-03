'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { SummarizeResponse } from '@/lib/types';

interface SummarizeSheetProps {
  videoId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SheetState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; summary: string; source: SummarizeResponse['source'] };

export function SummarizeSheet({ videoId, title, open, onOpenChange }: SummarizeSheetProps) {
  const [length, setLength] = useState<'short' | 'long'>('short');
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<SheetState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset local state whenever the sheet is closed so the next open starts fresh.
  useEffect(() => {
    if (open) return;
    setLength('short');
  }, [open]);

  useEffect(() => {
    if (!open) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'loading' });

    fetch(`/api/summarize?videoId=${encodeURIComponent(videoId)}&length=${length}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed to load summary' }));
          throw new Error(typeof body.error === 'string' ? body.error : 'Failed to load summary');
        }
        return (await res.json()) as SummarizeResponse;
      })
      .then((data) => {
        setState({ status: 'done', summary: data.summary, source: data.source });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load summary',
        });
      });

    return () => controller.abort();
  }, [open, videoId, length, retryKey]);

  async function handleCopy() {
    if (state.status !== 'done') return;
    try {
      await navigator.clipboard.writeText(state.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable; ignore.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Summary</SheetTitle>
          <SheetDescription className="line-clamp-1">{title}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 min-h-[6rem]">
          {state.status === 'loading' && (
            <div className="space-y-2" aria-live="polite">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {state.status === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{state.message}</p>
              <Button type="button" variant="outline" onClick={() => setRetryKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          )}

          {state.status === 'done' && (
            <div className="space-y-3">
              <Badge variant="secondary">
                {state.source === 'captions' ? 'From captions' : 'From description'}
              </Badge>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.summary}</p>
            </div>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={handleCopy}
            disabled={state.status !== 'done'}
          >
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={() => setLength('long')}
            disabled={state.status === 'loading' || length === 'long'}
          >
            Regenerate (longer)
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
