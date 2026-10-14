"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateProjectBudget } from "@/app/actions/budget";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface ProjectSpendRow {
  id: string;
  name: string;
  claude: number;
  bd: number;
  total: number;
  budget: number | null;
}

/** Chi phí tháng này theo dự án + ngân sách riêng (để trống = không giới hạn riêng). */
export function ProjectBudgets({ rows }: { rows: ProjectSpendRow[] }) {
  const t = useTranslations("usage");
  const format = useFormatter();
  const usd = (n: number) => format.number(n, { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-5 py-2.5">{t("project")}</th>
            <th className="px-3 py-2.5 text-right">Claude</th>
            <th className="px-3 py-2.5 text-right">Bright Data</th>
            <th className="px-3 py-2.5 text-right">{t("total")}</th>
            <th className="px-5 py-2.5">{t("projectBudget")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="max-w-48 truncate px-5 py-2.5 text-text">{r.name}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted">{usd(r.claude)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted">{usd(r.bd)}</td>
              <td
                className={cn(
                  "px-3 py-2.5 text-right font-medium tabular-nums",
                  r.budget != null && r.total >= r.budget ? "text-danger" : r.budget != null && r.total >= r.budget * 0.8 ? "text-warning" : "text-text",
                )}
              >
                {usd(r.total)}
              </td>
              <td className="px-5 py-2">
                <BudgetCell id={r.id} budget={r.budget} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BudgetCell({ id, budget }: { id: string; budget: number | null }) {
  const t = useTranslations("usage");
  const router = useRouter();
  const [v, setV] = useState(budget == null ? "" : String(budget));
  const [pending, start] = useTransition();
  const dirty = v !== (budget == null ? "" : String(budget));
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateProjectBudget(id, v.trim() === "" ? null : Number(v));
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("saved"));
          router.refresh();
        });
      }}
    >
      <Input
        type="number"
        min={0}
        step="1"
        className="h-8 w-24"
        placeholder={t("noLimit")}
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      {dirty && (
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          {t("saveShort")}
        </Button>
      )}
    </form>
  );
}
