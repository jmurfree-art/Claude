import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/types/database";

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; variant: "secondary" | "warning" | "success" | "destructive" }
> = {
  pending: { label: "Queued", variant: "secondary" },
  processing: { label: "Rendering", variant: "warning" },
  completed: { label: "Ready", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
