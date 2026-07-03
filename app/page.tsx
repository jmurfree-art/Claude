import Link from "next/link";
import {
  Clapperboard,
  Globe2,
  History,
  MonitorPlay,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

const FEATURES = [
  {
    icon: Wand2,
    title: "Script to video",
    description:
      "Paste a script, pick a presenter, and get a finished MP4 — no camera, studio, or editing.",
  },
  {
    icon: Globe2,
    title: "Multilingual voices",
    description:
      "Natural-sounding voices across a dozen-plus languages, filterable per project.",
  },
  {
    icon: MonitorPlay,
    title: "Every format",
    description:
      "Export 16:9 for YouTube, 9:16 for Reels and TikTok, or 1:1 for feeds.",
  },
  {
    icon: History,
    title: "Project history",
    description:
      "Every render is saved to your dashboard with live status, preview, and download.",
  },
  {
    icon: ShieldCheck,
    title: "Consent-first",
    description:
      "Built-in consent checks and moderation guardrails — impersonation is blocked by design.",
  },
  {
    icon: Clapperboard,
    title: "Provider-agnostic",
    description:
      "A clean provider abstraction: HeyGen today, self-hosted engines like Duix-Avatar tomorrow.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Clapperboard className="h-5 w-5 text-primary" />
            {APP_NAME}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-24 text-center">
          <p className="mb-4 inline-block rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            AI avatar video studio
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Turn any script into a{" "}
            <span className="text-primary">presenter-led video</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Type what you want said. Choose an avatar, a voice, and a language.
            {" "}{APP_NAME} renders a polished MP4 you can download and share —
            in minutes, not days.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/signup">Create your first video</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">I have an account</Link>
            </Button>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="mb-2 h-6 w-6 text-primary" />
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
              <h2 className="text-2xl font-semibold">
                Free to try — mock mode included
              </h2>
              <p className="max-w-xl text-muted-foreground">
                No provider API key yet? The app runs a full simulated render
                pipeline so you can explore the whole workflow before
                connecting HeyGen.
              </p>
              <Button size="lg" asChild>
                <Link href="/signup">Sign up free</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        {APP_NAME} — synthetic media must be used with consent. Impersonation
        is prohibited.
      </footer>
    </div>
  );
}
