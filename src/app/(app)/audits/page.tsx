import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, ScanSearch } from "lucide-react";
import { NoProject } from "@/components/no-project";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ScoreRing } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import type { AuditCheck } from "@/lib/types";
import { AuditForm } from "./audit-form";

export const maxDuration = 300;

export default async function AuditsPage() {
  const { supabase, active, profile } = await getWorkspace();
  const t = await getTranslations("audits");
  const format = await getFormatter();
  if (!active) return <NoProject />;

  const { data: audits } = await supabase
    .from("audits")
    .select("id, url, score, checks, created_at")
    .eq("project_id", active.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AuditForm projectId={active.id} domain={active.domain} canWrite={profile?.role !== "viewer"} />

      <Card className="mt-6">
        <CardHeader title={t("history")} icon={<ScanSearch className="h-4 w-4" />} />
        {audits?.length ? (
          <ul className="divide-y divide-border">
            {audits.map((a) => {
              const checks = a.checks as AuditCheck[];
              const errors = checks.filter((c) => c.severity === "error").length;
              const warnings = checks.filter((c) => c.severity === "warning").length;
              return (
                <li key={a.id}>
                  <Link href={`/audits/${a.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
                    <ScoreRing score={a.score ?? 0} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-text">{a.url}</div>
                      <div className="text-xs text-muted">
                        {format.dateTime(new Date(a.created_at), { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </div>
                    <div className="hidden gap-1.5 sm:flex">
                      {errors > 0 && <Badge tone="danger">{t("errors", { count: errors })}</Badge>}
                      {warnings > 0 && <Badge tone="warning">{t("warnings", { count: warnings })}</Badge>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<ScanSearch className="h-5 w-5" />} title={t("empty")} description={t("emptyDesc")} />
        )}
      </Card>
    </>
  );
}
