"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import type { Priority } from "@/lib/types";

export function IntentBadge({ intent }: { intent: string | null }) {
  const t = useTranslations("keywords.intent");
  if (!intent) return <span className="text-muted">—</span>;
  const tone = intent === "transactional" ? "success" : intent === "commercial" ? "primary" : intent === "navigational" ? "warning" : "info";
  return <Badge tone={tone}>{t(intent)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  const t = useTranslations("keywords.priority");
  if (!priority) return <span className="text-muted">—</span>;
  return <Badge tone={priority === "high" ? "danger" : priority === "medium" ? "warning" : "neutral"}>{t(priority)}</Badge>;
}

export function DifficultyBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  const color = value >= 70 ? "bg-danger" : value >= 40 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 rounded-full bg-surface-2">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-xs tabular-nums text-muted">{value}</span>
    </div>
  );
}

export function PositionBadge({ position }: { position: number | null }) {
  if (position == null) return <span className="text-muted">—</span>;
  return (
    <Badge tone={position <= 3 ? "success" : position <= 10 ? "primary" : "neutral"} className="tabular-nums">
      #{position}
    </Badge>
  );
}
