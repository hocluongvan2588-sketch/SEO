import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowDown, ArrowUp, BarChart3, CalendarClock, Minus } from "lucide-react";
import { NoProject } from "@/components/no-project";
import { PositionBadge } from "@/components/keyword-bits";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import { countryName, flag } from "@/lib/locales";
import { getLocale } from "next-intl/server";
import { isFresh } from "@/lib/rank-check";
import { PAGE_SIZE, pageOf } from "@/lib/paging";
import { Pager } from "@/components/ui/pager";
import { AutoCheckToggle } from "./auto-toggle";
import { CheckAllButton } from "./check-all";

export const maxDuration = 300;

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase, active, profile } = await getWorkspace();
  const t = await getTranslations("rankings");
  const format = await getFormatter();
  const ui = await getLocale();
  if (!active) return <NoProject />;

  const page = pageOf((await searchParams).page);
  const from = (page - 1) * PAGE_SIZE;

  // Chỉ tải 100 từ khóa mỗi trang; thống kê + lịch sử tính trong database (không bị giới hạn 1.000 dòng)
  const [{ data: keywords, count }, { data: stats }, { data: lastRun }] = await Promise.all([
    supabase
      .from("keywords")
      .select("*", { count: "exact" })
      .eq("project_id", active.id)
      .neq("status", "ignored")
      .order("current_position", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1),
    supabase
      .rpc("keyword_stats", { p_project: active.id })
      .maybeSingle<{ tracked: number; top3: number; top10: number; top30: number; fresh: number }>(),
    supabase
      .from("cron_runs")
      .select("finished_at, checked, remaining, note")
      .eq("job", "rankings")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ids = (keywords ?? []).map((k) => k.id);
  const { data: hist } = ids.length
    ? await supabase.rpc("rank_history", { p_keyword_ids: ids, p_limit: 10 })
    : { data: [] };
  const history = new Map<string, (number | null)[]>(
    ((hist ?? []) as { keyword_id: string; positions: (number | null)[] }[]).map((h) => [h.keyword_id, h.positions]),
  );

  const freshCount = stats?.fresh ?? 0;
  const autoReady = active.auto_rank_check !== undefined; // migration 0006 đã chạy
  const total = count ?? 0;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle", { domain: active.domain })}
        actions={profile?.role !== "viewer" && <CheckAllButton projectId={active.id} disabled={!total} />}
      />

      {autoReady && (
        <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 text-sm">
              <div className="font-medium text-text">{active.auto_rank_check ? t("autoScheduleOn") : t("autoScheduleOff")}</div>
              <div className="text-muted">
                {t("autoRule", { fresh: freshCount })}
                {lastRun?.finished_at && (
                  <>
                    {" · "}
                    {t("autoLast", { when: format.relativeTime(new Date(lastRun.finished_at)), count: lastRun.checked })}
                    {lastRun.remaining > 0 && ` · ${t("autoRemaining", { count: lastRun.remaining })}`}
                    {lastRun.note === "budget_exceeded" && ` · ${t("autoBudgetStop")}`}
                    {lastRun.note === "budget_warning_fresh_only" && ` · ${t("autoBudgetFresh")}`}
                  </>
                )}
              </div>
            </div>
          </div>
          <AutoCheckToggle projectId={active.id} enabled={!!active.auto_rank_check} disabled={profile?.role === "viewer"} />
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t("tracked"), v: stats?.tracked ?? 0 },
          { label: "Top 3", v: stats?.top3 ?? 0 },
          { label: "Top 10", v: stats?.top10 ?? 0 },
          { label: "Top 30", v: stats?.top30 ?? 0 },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-sm text-muted">{s.label}</div>
            <div className="mt-2 text-3xl font-semibold text-text">{s.v}</div>
          </Card>
        ))}
      </div>

      <Card>
        {!keywords?.length ? (
          <EmptyState icon={<BarChart3 className="h-5 w-5" />} title={t("empty")} description={t("emptyDesc")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5">{t("keyword")}</th>
                  <th className="px-3 py-2.5">{t("position")}</th>
                  <th className="px-3 py-2.5">{t("change")}</th>
                  <th className="px-3 py-2.5">{t("best")}</th>
                  <th className="px-3 py-2.5">{t("trend")}</th>
                  <th className="px-3 py-2.5">{t("checked")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keywords.map((k) => {
                  const h = history.get(k.id) ?? [];
                  const prev = h[1];
                  const delta = k.current_position && prev ? prev - k.current_position : null;
                  return (
                    <tr key={k.id} className="hover:bg-surface-2/50">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-text">
                          {k.keyword}
                          {isFresh(k) && (
                            <span className="ml-2 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                              {t("freshBadge")}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted">
                          {flag(k.country)} {countryName(k.country, ui)} · {k.locale}
                        </div>
                        {k.target_url && <div className="max-w-xs truncate text-xs text-muted">{k.target_url}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <PositionBadge position={k.current_position} />
                      </td>
                      <td className="px-3 py-2.5">
                        {delta == null || delta === 0 ? (
                          <Minus className="h-4 w-4 text-muted" />
                        ) : delta > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-success">
                            <ArrowUp className="h-3.5 w-3.5" />
                            {delta}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-danger">
                            <ArrowDown className="h-3.5 w-3.5" />
                            {-delta}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <PositionBadge position={k.best_position} />
                      </td>
                      <td className="px-3 py-2.5">
                        <Sparkline values={[...h].reverse()} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {k.last_checked_at ? format.relativeTime(new Date(k.last_checked_at)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex justify-end border-t border-border px-4 py-2">
              <Pager page={page} pageSize={PAGE_SIZE} total={total} />
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

/** Đường xu hướng thứ hạng: vị trí thấp hơn (tốt hơn) vẽ cao hơn. Không có thứ hạng = 31. */
function Sparkline({ values }: { values: (number | null)[] }) {
  if (values.length < 2) return <span className="text-xs text-muted">—</span>;
  const w = 80,
    h = 24;
  const pts = values.map((v, i) => {
    const pos = v ?? 31;
    return `${(i / (values.length - 1)) * w},${((pos - 1) / 30) * h}`;
  });
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts.join(" ")} fill="none" stroke="var(--primary)" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}
