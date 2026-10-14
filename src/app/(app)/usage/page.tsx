import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Bot, ExternalLink, Globe, History, Users, Wallet } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { getBalance } from "@/lib/brightdata";
import { getWorkspace } from "@/lib/context";
import { getMonthSpend } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { BudgetForm } from "./budget-form";

interface UsageRow {
  created_at: string;
  user_id: string | null;
  provider: "claude" | "brightdata";
  feature: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  requests: number;
  cost_usd: number;
}

const FEATURES = ["research", "audit", "schema", "rankings", "cluster", "leads"] as const;

export default async function UsagePage() {
  const { supabase, profile } = await getWorkspace();
  if (profile?.role !== "admin") redirect("/");
  const t = await getTranslations("usage");
  const format = await getFormatter();
  const usd = (n: number) => format.number(n, { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [spend, balance, { data: events, error }, { data: staff }] = await Promise.all([
    getMonthSpend(supabase),
    getBalance(),
    supabase.from("usage_events").select("*").gte("created_at", monthStart).order("created_at", { ascending: false }).limit(5000),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  if (!spend || error) {
    return (
      <>
        <PageHeader title={t("title")} description={t("subtitle")} />
        <Card>
          <EmptyState icon={<Wallet className="h-5 w-5" />} title={t("notReady")} description={t("notReadyDesc")} />
        </Card>
      </>
    );
  }

  const rows = (events ?? []) as UsageRow[];
  const names = new Map((staff ?? []).map((s) => [s.id, s.full_name || s.email]));
  const sum = (list: UsageRow[], provider?: string) =>
    list.filter((r) => !provider || r.provider === provider).reduce((s, r) => s + Number(r.cost_usd), 0);

  const byFeature = FEATURES.map((f) => {
    const list = rows.filter((r) => r.feature === f);
    return { f, claude: sum(list, "claude"), bd: sum(list, "brightdata"), total: sum(list) };
  }).filter((x) => x.total > 0);

  const byUser = Array.from(new Set(rows.map((r) => r.user_id)))
    .map((id) => {
      const list = rows.filter((r) => r.user_id === id);
      return { id, name: id ? names.get(id) || "—" : t("auto"), claude: sum(list, "claude"), bd: sum(list, "brightdata"), total: sum(list) };
    })
    .sort((a, b) => b.total - a.total);

  const meters = [
    { key: "claude", icon: Bot, spent: spend.claude_usd, budget: spend.claude_budget_usd },
    { key: "brightdata", icon: Globe, spent: spend.brightdata_usd, budget: spend.brightdata_budget_usd },
  ] as const;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid gap-4 lg:grid-cols-3">
        {meters.map((m) => {
          const pct = m.budget > 0 ? Math.min(100, (m.spent / m.budget) * 100) : 100;
          const tone = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "success";
          return (
            <Card key={m.key} className="p-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-text">
                  <m.icon className="h-4 w-4 text-primary" />
                  {t(`provider.${m.key}`)}
                </span>
                <Badge tone={tone}>{t(`state.${tone}`)}</Badge>
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-text">{usd(m.spent)}</div>
              <div className="mt-1 text-sm text-muted">{t("ofBudget", { budget: usd(m.budget) })}</div>
              <div className="mt-3 h-2 rounded-full bg-surface-2">
                <div
                  className={cn("h-2 rounded-full", tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-success")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Card>
          );
        })}

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Wallet className="h-4 w-4 text-primary" />
            {t("balances")}
          </div>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">Bright Data</dt>
              <dd className="font-semibold text-text">
                {balance ? usd(balance.balance) : <span className="font-normal text-muted">{t("unavailable")}</span>}
              </dd>
            </div>
            {balance && balance.pending > 0 && (
              <div className="flex justify-between gap-2 text-xs">
                <dt className="text-muted">{t("pending")}</dt>
                <dd className="text-text">{usd(balance.pending)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">Claude API</dt>
              <dd>
                <a
                  href="https://platform.claude.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {t("openConsole")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">{t("balanceNote")}</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("byFeature")} />
          {byFeature.length ? (
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5">{t("feature")}</th>
                  <th className="px-3 py-2.5 text-right">Claude</th>
                  <th className="px-3 py-2.5 text-right">Bright Data</th>
                  <th className="px-5 py-2.5 text-right">{t("total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byFeature.map((x) => (
                  <tr key={x.f}>
                    <td className="px-5 py-2.5 text-text">{t(`features.${x.f}`)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{usd(x.claude)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{usd(x.bd)}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums text-text">{usd(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">{t("empty")}</p>
          )}
        </Card>

        <Card>
          <CardHeader title={t("byUser")} icon={<Users className="h-4 w-4" />} />
          {byUser.length ? (
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5">{t("staff")}</th>
                  <th className="px-3 py-2.5 text-right">Claude</th>
                  <th className="px-3 py-2.5 text-right">Bright Data</th>
                  <th className="px-5 py-2.5 text-right">{t("total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byUser.map((x) => (
                  <tr key={x.id ?? "none"}>
                    <td className="px-5 py-2.5 text-text">{x.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{usd(x.claude)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{usd(x.bd)}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums text-text">{usd(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">{t("empty")}</p>
          )}
        </Card>

        <Card>
          <CardHeader title={t("budgets")} description={t("budgetsDesc")} icon={<Wallet className="h-4 w-4" />} />
          <div className="p-5">
            <BudgetForm claude={spend.claude_budget_usd} brightdata={spend.brightdata_budget_usd} />
          </div>
        </Card>

        <Card>
          <CardHeader title={t("recent")} icon={<History className="h-4 w-4" />} />
          {rows.length ? (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {rows.slice(0, 40).map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Badge tone={r.provider === "claude" ? "primary" : "info"}>{r.provider === "claude" ? "Claude" : "Bright Data"}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-text">
                      {t(`features.${r.feature}`)} · {r.user_id ? names.get(r.user_id) || "—" : t("auto")}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {r.provider === "claude"
                        ? t("tokens", { model: r.model ?? "", input: r.input_tokens, output: r.output_tokens })
                        : t("requests", { count: r.requests })}
                      {" · "}
                      {format.relativeTime(new Date(r.created_at))}
                    </div>
                  </div>
                  <span className="tabular-nums text-text">{usd(Number(r.cost_usd))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">{t("empty")}</p>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">{t("estimateNote")}</p>
    </>
  );
}
