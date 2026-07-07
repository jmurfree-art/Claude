import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-muted-foreground">This page could not be found.</p>
      <Button asChild className="h-11">
        <Link href="/">Back to search</Link>
      </Button>
    </div>
  );
}
