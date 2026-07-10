import type { Metadata, Viewport } from "next";
import { SwRegister } from "@/components/sw-register";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — AI avatar videos from a script`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Turn any script into a presenter-led video with AI avatars, natural voices, and multilingual support.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#6d4fd4",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
