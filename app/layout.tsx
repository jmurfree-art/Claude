import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — AI avatar videos from a script`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Turn any script into a presenter-led video with AI avatars, natural voices, and multilingual support.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
