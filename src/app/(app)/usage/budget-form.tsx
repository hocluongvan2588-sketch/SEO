"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateBudgets } from "@/app/actions/budget";
import { Button, Field, Input } from "@/components/ui";

export function BudgetForm({ claude, brightdata }: { claude: number; brightdata: number }) {
  const t = useTranslations("usage");
  const router = useRouter();
  const [c, setC] = useState(String(claude));
  const [b, setB] = useState(String(brightdata));
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateBudgets({ claude: Number(c), brightdata: Number(b) });
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("saved"));
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("claudeBudget")}>
          <Input type="number" min={0} step="1" value={c} onChange={(e) => setC(e.target.value)} required />
        </Field>
        <Field label={t("bdBudget")}>
          <Input type="number" min={0} step="1" value={b} onChange={(e) => setB(e.target.value)} required />
        </Field>
      </div>
      <p className="text-xs text-muted">{t("budgetHint")}</p>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
