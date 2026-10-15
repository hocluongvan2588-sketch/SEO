"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createReport } from "@/app/actions/reports";
import { Button, Field, Select } from "@/components/ui";
import { useCostLabel } from "@/components/use-cost";

const SECTIONS = ["health", "international", "keywords", "competitors", "rankings", "roadmap"] as const;

export function CreateReport({
  projectId,
  defaultLocale,
  audits,
  keywords,
  canWrite,
  contactMissing,
}: {
  projectId: string;
  defaultLocale: "vi" | "en";
  audits: number;
  keywords: number;
  canWrite: boolean;
  contactMissing: boolean;
}) {
  const t = useTranslations("reports");
  const router = useRouter();
  const costLabel = useCostLabel();
  const [locale, setLocale] = useState<"vi" | "en">(defaultLocale);
  const [sections, setSections] = useState<string[]>([...SECTIONS]);
  const [pending, start] = useTransition();
  const noData = audits === 0 && keywords === 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const id = toast.loading(t("generating"));
          const r = await createReport({ projectId, locale, sections: sections as (typeof SECTIONS)[number][] });
          if (!r.ok) return void toast.error(r.error, { id });
          toast.success(t("created"), { id, description: costLabel(r.data.costUsd) });
          router.push(`/reports/${r.data.id}`);
        });
      }}
    >
      <ul className="space-y-1 rounded-lg bg-surface-2/60 p-3 text-sm">
        <li className="flex justify-between">
          <span className="text-muted">{t("dataAudits")}</span>
          <Link href="/audits" className="font-medium text-primary hover:underline">
            {audits}
          </Link>
        </li>
        <li className="flex justify-between">
          <span className="text-muted">{t("dataKeywords")}</span>
          <Link href="/keywords" className="font-medium text-primary hover:underline">
            {keywords}
          </Link>
        </li>
      </ul>
      {noData && <p className="text-xs text-warning">{t("noData")}</p>}

      <Field label={t("language")}>
        <Select value={locale} onChange={(e) => setLocale(e.target.value as "vi" | "en")}>
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </Select>
      </Field>

      <Field label={t("sections")} hint={t("sectionsHint")}>
        <div className="space-y-1.5">
          {SECTIONS.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={sections.includes(s)}
                onChange={() => setSections(sections.includes(s) ? sections.filter((x) => x !== s) : [...sections, s])}
              />
              {t(`section.${s}`)}
            </label>
          ))}
        </div>
      </Field>

      {contactMissing && (
        <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-text">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            {t("contactMissing")}{" "}
            <Link href="/settings" className="font-medium text-primary hover:underline">
              {t("openSettings")}
            </Link>
          </span>
        </div>
      )}

      <Button type="submit" className="w-full" loading={pending} disabled={!canWrite || noData || !sections.length}>
        {!pending && <Sparkles className="h-4 w-4" />}
        {t("generate")}
      </Button>
      <p className="text-xs text-muted">{t("costHint")}</p>
    </form>
  );
}
