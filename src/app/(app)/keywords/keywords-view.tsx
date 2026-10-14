"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { List, Sparkles } from "lucide-react";
import type { KeywordFilters } from "@/lib/keyword-filters";
import type { Keyword, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KeywordTable } from "./keyword-table";
import { ResearchPanel } from "./research-panel";

export function KeywordsView({
  project,
  keywords,
  history,
  initialTab,
  canWrite,
  ...list
}: {
  project: Project;
  keywords: Keyword[];
  total: number;
  matched: number;
  page: number;
  pageSize: number;
  filters: KeywordFilters;
  facets: { countries: string[]; clusters: string[] };
  history: { id: string; seed: string; locale: string; country: string; created_at: string }[];
  initialTab: "list" | "research";
  canWrite: boolean;
}) {
  const t = useTranslations("keywords");
  const [tab, setTab] = useState(initialTab);

  const tabs = [
    { id: "list" as const, label: t("tabList", { count: list.total }), icon: List },
    { id: "research" as const, label: t("tabResearch"), icon: Sparkles },
  ];

  return (
    <>
      <div className="mb-5 inline-flex rounded-lg border border-border bg-surface p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === x.id ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:text-text",
            )}
          >
            <x.icon className="h-4 w-4" />
            {x.label}
          </button>
        ))}
      </div>
      {/* Giữ cả hai tab trong DOM để không mất kết quả nghiên cứu khi chuyển tab */}
      <div className={tab === "list" ? "" : "hidden"}>
        <KeywordTable project={project} keywords={keywords} {...list} canWrite={canWrite} onResearch={() => setTab("research")} />
      </div>
      <div className={tab === "research" ? "" : "hidden"}>
        <ResearchPanel project={project} history={history} canWrite={canWrite} onSaved={() => setTab("list")} />
      </div>
    </>
  );
}
