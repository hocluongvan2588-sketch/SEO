import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, Info, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, ScoreRing } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import type { Audit, AuditCheck } from "@/lib/types";
import { DeleteAuditButton, RerunButton } from "./audit-actions";

export const maxDuration = 300;

const CATEGORIES: AuditCheck["category"][] = ["meta", "content", "technical", "international", "structured-data", "images", "links"];

const SEVERITY_ICON = {
  error: <AlertCircle className="h-4 w-4 text-danger" />,
  warning: <TriangleAlert className="h-4 w-4 text-warning" />,
  info: <Info className="h-4 w-4 text-info" />,
  pass: <CheckCircle2 className="h-4 w-4 text-success" />,
};

const ORDER = { error: 0, warning: 1, info: 2, pass: 3 };

export default async function AuditDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await getWorkspace();
  const t = await getTranslations("audits");
  const tc = await getTranslations("checks");
  const format = await getFormatter();
  const { data } = await supabase.from("audits").select("*").eq("id", id).single();
  if (!data) notFound();
  const audit = data as Audit;
  const page = (audit.page ?? {}) as Record<string, unknown> & {
    title?: string;
    metaDescription?: string;
    h1?: string[];
    hreflang?: { lang: string; href: string }[];
    schemaTypes?: string[];
    wordCount?: number;
    lang?: string | null;
    fetchedVia?: string;
  };
  const count = (s: string) => audit.checks.filter((c) => c.severity === s).length;
  const canWrite = profile?.role !== "viewer";

  return (
    <>
      <Link href="/audits" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>
      <PageHeader
        title={t("detailTitle")}
        description={
          <a href={audit.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            {audit.url}
            <ExternalLink className="h-3 w-3" />
          </a>
        }
        actions={
          canWrite && (
            <>
              <RerunButton projectId={audit.project_id} url={audit.url} />
              <DeleteAuditButton id={audit.id} />
            </>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Card className="flex items-center gap-5 p-5">
          <ScoreRing score={audit.score ?? 0} size={96} />
          <div>
            <div className="text-sm text-muted">{t("score")}</div>
            <div className="mt-1 text-xs text-muted">{format.dateTime(new Date(audit.created_at), { dateStyle: "medium", timeStyle: "short" })}</div>
            {page.fetchedVia && <Badge className="mt-2">{t("via", { via: page.fetchedVia })}</Badge>}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["error", "warning", "info", "pass"] as const).map((s) => (
            <Card key={s} className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted">
                {SEVERITY_ICON[s]}
                {t(`sev.${s}`)}
              </div>
              <div className="mt-2 text-3xl font-semibold text-text">{count(s)}</div>
            </Card>
          ))}
        </div>
      </div>

      {audit.ai && (
        <Card className="mt-6">
          <CardHeader title={t("aiTitle")} icon={<Sparkles className="h-4 w-4" />} />
          <div className="p-5">
            <p className="text-sm leading-relaxed text-text">{audit.ai.summary}</p>
            <ol className="mt-5 space-y-3">
              {audit.ai.fixes.map((f, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-border p-4">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text">{f.title}</span>
                      <Badge tone={f.impact === "high" ? "danger" : f.impact === "medium" ? "warning" : "neutral"}>
                        {t("impact")}: {t(`level.${f.impact}`)}
                      </Badge>
                      <Badge>
                        <Wrench className="h-3 w-3" />
                        {t(`level.${f.effort}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted">{f.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {CATEGORIES.map((cat) => {
            const items = audit.checks.filter((c) => c.category === cat).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
            if (!items.length) return null;
            return (
              <Card key={cat}>
                <CardHeader title={t(`cat.${cat}`)} />
                <ul className="divide-y divide-border">
                  {items.map((c, i) => (
                    <li key={i} className="flex gap-3 px-5 py-3">
                      <div className="mt-0.5">{SEVERITY_ICON[c.severity]}</div>
                      <div className="min-w-0">
                        <div className="text-sm text-text">{tc(c.id, (c.params ?? {}) as Record<string, string | number>)}</div>
                        {c.value && <div className="mt-0.5 break-words font-mono text-xs text-muted">{c.value}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>

        <Card className="h-fit">
          <CardHeader title={t("pageFacts")} />
          <dl className="space-y-4 p-5 text-sm">
            <Fact label="Title" value={page.title} />
            <Fact label="Meta description" value={page.metaDescription} />
            <Fact label="H1" value={page.h1?.join(" | ")} />
            <Fact label={t("lang")} value={page.lang ?? undefined} />
            <Fact label={t("words")} value={page.wordCount?.toString()} />
            <Fact label="Schema" value={page.schemaTypes?.join(", ")} />
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">hreflang</dt>
              <dd className="mt-1 space-y-1">
                {page.hreflang?.length ? (
                  page.hreflang.map((h) => (
                    <div key={h.lang + h.href} className="flex gap-2 text-xs">
                      <Badge tone="info">{h.lang}</Badge>
                      <span className="truncate text-muted">{h.href}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-muted">—</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 break-words text-text">{value || <span className="text-muted">—</span>}</dd>
    </div>
  );
}
