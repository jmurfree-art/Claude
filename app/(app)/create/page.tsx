import type { Metadata } from "next";
import { CreateVideoForm } from "@/components/create-video-form";

export const metadata: Metadata = { title: "Create video" };

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create a video</h1>
        <p className="text-sm text-muted-foreground">
          Script in, MP4 out. Configure your presenter and press generate.
        </p>
      </div>
      <CreateVideoForm />
    </div>
  );
}
