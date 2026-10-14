"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ExternalLink, History, Lightbulb, Loader2, Save, Search, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { getResearch, runKeywordResearch, saveKeywords, type ResearchResult } from "@/app/actions/keywords";
import { DifficultyBar, IntentBadge, PriorityBadge } from "@/components/keyword-bits";
import { Badge, Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { countryName, defaultCountryFor, flag, languageName } from "@/lib/locales";
import { CountrySelect } from "@/components/ui/country-picker";
import type { Project } from "@/lib/types";

export function ResearchPanel({
  project,
  history,
  canWrite,
  onSaved,
}: {
  project: Project;
  history: { id: string; seed: string; locale: string; country: string; created_at: string }[];
  canWrite: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("research");
  const ui = useLocale();
  const markets = project.markets?.length ? project.markets : [project.country];
  const format = useFormatter();
  const router = useRouter();
  const [seed, setSeed] = useState("");
  const [locale, setLocale] = useState(project.default_locale);
  const [country, setCountry] = useState(project.country);
  const [result, setResult] = useState<(ResearchResult & { locale: string; country: string }) | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [running, startRun] = useTransition();
  const [saving, startSave] = useTransition();

  // Đổi ngôn ngữ → gợi ý thị trường phù hợp trong các thị trường của dự án
  const onLocaleChange = (code: string) => {
    setLocale(code);
    if (code === project.default_locale) return setCountry(project.country);
    const suggested = defaultCountryFor(code);
    if (suggested && markets.includes(suggested)) setCountry(suggested);
    else if (suggested && !markets.includes(country)) setCountry(suggested);
  };

  const run = () =>
    startRun(async () => {
      const res = await runKeywordResearch({ projectId: project.id, seed, locale, country });
      if (!res.ok) return void toast.error(t("failed"), { description: res.error });
      setResult({ ...res.data, locale, country });
      setSelected(new Set(res.data.ai.keywords.map((_, i) => i).filter((i) => res.data.ai.keywords[i].priority !== "low")));
      router.refresh();
    });

  const load = (id: string) =>
    startRun(async () => {
      const res = await getResearch(id);
      if (!res.ok) return void toast.error(res.error);
      setSeed(res.data.seed);
      setLocale(res.data.locale);
      setCountry(res.data.country);
      setResult({ ...res.data });
      setSelected(new Set());
    });

  const save = () =>
    startSave(async () => {
      if (!result) return;
      const kws = result.ai.keywords.filter((_, i) => selected.has(i));
      const res = await saveKeywords({ projectId: project.id, researchId: result.researchId, locale: result.locale, country: result.country, keywords: kws });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("saved", { count: res.data.count }));
      router.refresh();
      onSaved();
    });

  const toggleAll = () => {
    if (!result) return;
    setSelected(selected.size === result.ai.keywords.length ? new Set() : new Set(result.ai.keywords.map((_, i) => i)));
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <form
          className="grid gap-3 md:grid-cols-[1fr_190px_210px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (seed.trim()) run();
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder={t("seedPh")}
              disabled={running}
              autoFocus
            />
          </div>
          <Select value={locale} onChange={(e) => onLocaleChange(e.target.value)} disabled={running}>
            {project.locales.map((l) => (
              <option key={l} value={l}>
                {languageName(l, ui)}
              </option>
            ))}
          </Select>
          <CountrySelect value={country} onChange={setCountry} pinned={markets} disabled={running} />
          <Button type="submit" loading={running} disabled={!seed.trim() || !canWrite}>
            {!running && <Sparkles className="h-4 w-4" />}
            {t("run")}
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted">{t("hint")}</p>

        {history.length > 0 && !running && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted">
              <History className="h-3.5 w-3.5" />
              {t("history")}
            </span>
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => load(h.id)}
                className="rounded-full border border-border px-3 py-1 text-xs text-text hover:border-primary hover:text-primary"
                title={format.dateTime(new Date(h.created_at), { dateStyle: "medium", timeStyle: "short" })}
              >
                {flag(h.country)} {h.seed} · {h.locale}
              </button>
            ))}
          </div>
        )}
      </Card>

      {running && (
        <Card className="p-10">
          <div className="flex flex-col items-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 font-medium text-text">{t("running")}</p>
            <p className="mt-1 text-sm text-muted">{t("runningDesc")}</p>
          </div>
        </Card>
      )}

      {result && !running && (
        <>
          <Card className="border-primary/30 bg-primary-soft/40 p-5">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-text">{t("summary")}</div>
                <p className="mt-1 text-sm leading-relaxed text-text/80">{result.ai.summary}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={`${t("ideas", { count: result.ai.keywords.length })} · ${flag(result.country)} ${countryName(result.country, ui)}`}
              description={t("ideasDesc")}
              action={
                canWrite && (
                  <Button onClick={save} loading={saving} disabled={selected.size === 0}>
                    <Save className="h-4 w-4" />
                    {t("saveSelected", { count: selected.size })}
                  </Button>
                )
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox" checked={selected.size === result.ai.keywords.length} onChange={toggleAll} />
                    </th>
                    <th className="px-3 py-2.5">{t("colKeyword")}</th>
                    <th className="px-3 py-2.5">{t("colIntent")}</th>
                    <th className="px-3 py-2.5">{t("colDifficulty")}</th>
                    <th className="px-3 py-2.5">{t("colPriority")}</th>
                    <th className="px-3 py-2.5">{t("colCluster")}</th>
                    <th className="px-3 py-2.5">{t("colContent")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.ai.keywords.map((k, i) => (
                    <tr
                      key={i}
                      className="cursor-pointer hover:bg-surface-2/50"
                      onClick={() => {
                        const s = new Set(selected);
                        if (s.has(i)) s.delete(i);
                        else s.add(i);
                        setSelected(s);
                      }}
                    >
                      <td className="px-4 py-2.5">
                        <input type="checkbox" checked={selected.has(i)} readOnly />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-text">{k.keyword}</div>
                        <div className="mt-0.5 max-w-md text-xs text-muted">{k.rationale}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <IntentBadge intent={k.intent} />
                      </td>
                      <td className="px-3 py-2.5">
                        <DifficultyBar value={k.difficulty} />
                      </td>
                      <td className="px-3 py-2.5">
                        <PriorityBadge priority={k.priority} />
                      </td>
                      <td className="px-3 py-2.5 text-muted">{k.cluster}</td>
                      <td className="px-3 py-2.5 text-muted">{k.content_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={t("serp")} description={t("serpDesc")} icon={<Search className="h-4 w-4" />} />
              <ol className="divide-y divide-border">
                {result.serp.organic.slice(0, 10).map((o) => (
                  <li key={o.link} className="flex gap-3 px-5 py-3">
                    <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-muted">{o.rank}</span>
                    <div className="min-w-0">
                      <a href={o.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        <span className="truncate">{o.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      <div className="truncate text-xs text-success">{o.link}</div>
                      {o.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{o.description}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader title={t("gaps")} icon={<Lightbulb className="h-4 w-4" />} />
                <ul className="space-y-2 p-5 text-sm text-text">
                  {result.ai.content_gaps.map((g, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {g}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title={t("competitors")} icon={<Users className="h-4 w-4" />} />
                <ul className="divide-y divide-border">
                  {result.ai.competitors.map((c) => (
                    <li key={c.domain} className="px-5 py-2.5 text-sm">
                      <span className="font-medium text-text">{c.domain}</span>
                      <span className="text-muted"> — {c.note}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              {(result.serp.peopleAlsoAsk.length > 0 || result.serp.related.length > 0) && (
                <Card className="p-5">
                  {result.serp.peopleAlsoAsk.length > 0 && (
                    <>
                      <div className="mb-2 text-sm font-medium text-text">{t("paa")}</div>
                      <div className="mb-4 flex flex-wrap gap-1.5">
                        {result.serp.peopleAlsoAsk.map((q) => (
                          <Badge key={q}>{q}</Badge>
                        ))}
                      </div>
                    </>
                  )}
                  {result.serp.related.length > 0 && (
                    <>
                      <div className="mb-2 text-sm font-medium text-text">{t("related")}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {result.serp.related.map((q) => (
                          <button key={q} onClick={() => setSeed(q)} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-primary">
                            {q}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
