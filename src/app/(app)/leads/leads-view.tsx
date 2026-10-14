"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Database, List, UserSearch } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import type { Lead, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FindPanel } from "./find-panel";
import { LeadTable } from "./lead-table";

export function LeadsView({
  project,
  leads,
  staff,
  currentUserId,
  initialTab,
  canWrite,
  notReady,
}: {
  project: Project;
  leads: Lead[];
  staff: { id: string; name: string }[];
  currentUserId: string;
  initialTab: "list" | "find";
  canWrite: boolean;
  notReady: boolean;
}) {
  const t = useTranslations("leads");
  const [tab, setTab] = useState(initialTab);

  if (notReady) {
    return (
      <Card>
        <EmptyState icon={<Database className="h-5 w-5" />} title={t("notReady")} description={t("notReadyDesc")} />
      </Card>
    );
  }

  const tabs = [
    { id: "list" as const, label: t("tabList", { count: leads.length }), icon: List },
    { id: "find" as const, label: t("tabFind"), icon: UserSearch },
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
      {/* Giữ cả hai tab trong DOM để không mất kết quả tìm kiếm khi chuyển tab */}
      <div className={tab === "list" ? "" : "hidden"}>
        <LeadTable
          project={project}
          leads={leads}
          staff={staff}
          currentUserId={currentUserId}
          canWrite={canWrite}
          onFind={() => setTab("find")}
        />
      </div>
      <div className={tab === "find" ? "" : "hidden"}>
        <FindPanel project={project} canWrite={canWrite} onSaved={() => setTab("list")} />
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted">{t("compliance")}</p>
    </>
  );
}
