import type { Metadata, Viewport } from 'next';

import './globals.css';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  title: 'WatchDeck',
  description: 'Search YouTube, save a watchlist, upload your own videos, and get quick AI summaries.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16">{children}</main>
      </body>
    </html>
  );
}
