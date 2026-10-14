import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, BarChart3, Braces, ScanSearch, Search, Target, TrendingUp } from "lucide-react";
import { NoProject } from "@/components/no-project";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ScoreRing } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import type { KeywordStatus } from "@/lib/types";

const STATUSES: KeywordStatus[] = ["new", "planned", "writing", "published"];

export default async function Dashboard() {
  const { supabase, profile, active } = await getWorkspace();
  const t = await getTranslations("dashboard");
  const tk = await getTranslations("keywords");
  const format = await getFormatter();

  if (!active) {
    return (
      <>
        <PageHeader title={t("hello", { name: profile?.full_name ?? "" })} description={t("subtitle")} />
        <NoProject />
      </>
    );
  }

  const [kw, audits, schemas, ranked] = await Promise.all([
    supabase.from("keywords").select("status, current_position").eq("project_id", active.id),
    supabase.from("audits").select("id, url, score, created_at").eq("project_id", active.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("schemas").select("id", { count: "exact", head: true }).eq("project_id", active.id),
    supabase
      .from("keywords")
      .select("id, keyword, locale, current_position, best_position")
      .eq("project_id", active.id)
      .not("current_position", "is", null)
      .order("current_position")
      .limit(6),
  ]);

  const keywords = kw.data ?? [];
  const top10 = keywords.filter((k) => k.current_position && k.current_position <= 10).length;
  const avgScore = audits.data?.length
    ? Math.round(audits.data.reduce((s, a) => s + (a.score ?? 0), 0) / audits.data.length)
    : null;
  const pipeline = STATUSES.map((s) => ({ s, n: keywords.filter((k) => k.status === s).length }));
  const pipelineMax = Math.max(1, ...pipeline.map((p) => p.n));

  const stats = [
    { label: t("statKeywords"), value: keywords.length, icon: Search },
    { label: t("statTop10"), value: top10, icon: TrendingUp },
    { label: t("statAudit"), value: avgScore ?? "—", icon: ScanSearch },
    { label: t("statSchemas"), value: schemas.count ?? 0, icon: Braces },
  ];

  const actions = [
    { href: "/keywords?tab=research", title: t("actionResearch"), desc: t("actionResearchDesc"), icon: Search },
    { href: "/audits", title: t("actionAudit"), desc: t("actionAuditDesc"), icon: ScanSearch },
    { href: "/schemas", title: t("actionSchema"), desc: t("actionSchemaDesc"), icon: Braces },
  ];

  return (
    <>
      <PageHeader title={t("hello", { name: profile?.full_name ?? "" })} description={t("subtitleProject", { project: active.name })} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">{s.label}</span>
              <s.icon className="h-4 w-4 text-muted" />
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-text">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="group">
            <Card className="flex h-full items-start gap-4 p-5 transition-all group-hover:border-primary group-hover:shadow-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <a.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 font-medium text-text">
                  {a.title}
                  <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-0.5 text-sm text-muted">{a.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t("recentAudits")}
            icon={<ScanSearch className="h-4 w-4" />}
            action={
              <Link href="/audits" className="text-sm text-primary hover:underline">
                {t("viewAll")}
              </Link>
            }
          />
          {audits.data?.length ? (
            <ul className="divide-y divide-border">
              {audits.data.map((a) => (
                <li key={a.id}>
                  <Link href={`/audits/${a.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
                    <ScoreRing score={a.score ?? 0} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text">{a.url}</div>
                      <div className="text-xs text-muted">{format.relativeTime(new Date(a.created_at))}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ScanSearch className="h-5 w-5" />} title={t("noAudits")} />
          )}
        </Card>

        <Card>
          <CardHeader title={t("pipeline")} icon={<Target className="h-4 w-4" />} />
          <div className="space-y-3 p-5">
            {pipeline.map((p) => (
              <div key={p.s}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted">{tk(`status.${p.s}`)}</span>
                  <span className="font-medium text-text">{p.n}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(p.n / pipelineMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border">
            <div className="flex items-center justify-between px-5 pt-4 text-sm font-medium text-text">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                {t("topRankings")}
              </span>
            </div>
            {ranked.data?.length ? (
              <ul className="space-y-2 px-5 py-3">
                {ranked.data.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-text">{k.keyword}</span>
                    <Badge tone={k.current_position! <= 3 ? "success" : k.current_position! <= 10 ? "primary" : "neutral"}>
                      #{k.current_position}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">{t("noRankings")}</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
