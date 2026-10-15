import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { NoProject } from "@/components/no-project";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import { CreateReport } from "./create-report";

export const maxDuration = 300;

export default async function ReportsPage() {
  const { supabase, active, profile } = await getWorkspace();
  const t = await getTranslations("reports");
  const format = await getFormatter();
  if (!active) return <NoProject />;

  const [{ data: reports, error }, { count: audits }, { count: keywords }] = await Promise.all([
    supabase
      .from("reports")
      .select("id, title, locale, sections, valid_until, created_at, contact")
      .eq("project_id", active.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("audits").select("id", { count: "exact", head: true }).eq("project_id", active.id),
    supabase.from("keywords").select("id", { count: "exact", head: true }).eq("project_id", active.id),
  ]);
  const contactMissing = !profile?.job_title || !profile?.phone;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { domain: active.domain })} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card className="h-fit">
          <CardHeader title={t("create")} description={t("createDesc")} />
          <div className="p-5">
            {error ? (
              <p className="text-sm text-muted">{t("notReady")}</p>
            ) : (
              <CreateReport
                projectId={active.id}
                defaultLocale={active.default_locale === "vi" ? "vi" : "en"}
                audits={audits ?? 0}
                keywords={keywords ?? 0}
                canWrite={profile?.role !== "viewer"}
                contactMissing={contactMissing}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("list")} icon={<FileText className="h-4 w-4" />} />
          {reports?.length ? (
            <ul className="divide-y divide-border">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/50">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-text">{r.title}</div>
                      <div className="truncate text-xs text-muted">
                        {format.dateTime(new Date(r.created_at), { dateStyle: "medium" })} · {(r.contact as { name?: string })?.name}
                        {r.valid_until && ` · ${t("validUntil", { date: format.dateTime(new Date(r.valid_until), { dateStyle: "medium" }) })}`}
                      </div>
                    </div>
                    <Badge>{r.locale.toUpperCase()}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<FileText className="h-5 w-5" />} title={t("empty")} description={t("emptyDesc")} />
          )}
        </Card>
      </div>
    </>
  );
}
