"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, ExternalLink, Link2, Loader2, Plus, Search, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { collectLeads, searchBuyers, type BuyerSearchResult } from "@/app/actions/leads";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { CountrySelect } from "@/components/ui/country-picker";
import { useCostLabel } from "@/components/use-cost";
import { CONTENT_LOCALES, languageName } from "@/lib/locales";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Chức danh thường gặp của người mua thực phẩm nhập khẩu */
const ROLE_PRESETS = [
  "Purchasing Manager",
  "Buyer",
  "Sourcing Manager",
  "Procurement Manager",
  "Category Manager",
  "Import Manager",
  "Importer",
  "Distributor",
  "Owner",
  "CEO",
];
const DEFAULT_ROLES = ["Purchasing Manager", "Buyer", "Sourcing Manager", "Importer"];
const MAX_PER_RUN = 20;

export function FindPanel({ project, canWrite, onSaved }: { project: Project; canWrite: boolean; onSaved: () => void }) {
  const t = useTranslations("leads");
  const ui = useLocale();
  const router = useRouter();
  const costLabel = useCostLabel();
  const markets = project.markets?.length ? project.markets : [project.country];

  const [mode, setMode] = useState<"search" | "paste">("search");
  const [product, setProduct] = useState("");
  const [country, setCountry] = useState(markets.find((m) => m !== "vn") ?? "us");
  const [roles, setRoles] = useState<string[]>(DEFAULT_ROLES);
  const [customRole, setCustomRole] = useState("");
  const [extra, setExtra] = useState("food");
  const [pasted, setPasted] = useState("");
  const [withAi, setWithAi] = useState(true);
  const [messageLanguage, setMessageLanguage] = useState("en");
  const [result, setResult] = useState<BuyerSearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, startSearch] = useTransition();
  const [collecting, startCollect] = useTransition();

  const toggleRole = (r: string) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  const search = () =>
    startSearch(async () => {
      const res = await searchBuyers({ projectId: project.id, product, country, roles, extra });
      if (!res.ok) return void toast.error(t("searchFailed"), { description: res.error });
      setResult(res.data);
      setSelected(new Set(res.data.candidates.filter((c) => !c.saved).slice(0, MAX_PER_RUN).map((c) => c.url)));
      toast.success(t("found", { count: res.data.candidates.length }), { description: costLabel(res.data.costUsd) });
    });

  const pastedUrls = pasted
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /linkedin\.com\/in\//i.test(s));
  const urls = mode === "search" ? [...selected] : pastedUrls;

  const collect = () =>
    startCollect(async () => {
      const res = await collectLeads({
        projectId: project.id,
        urls: urls.slice(0, MAX_PER_RUN),
        product,
        source: mode === "search" ? "search" : "manual",
        searchQuery: mode === "search" ? result?.query : undefined,
        withAi,
        messageLanguage,
      });
      if (!res.ok) return void toast.error(t("collectFailed"), { description: res.error });
      toast.success(t("collected", { saved: res.data.saved, failed: res.data.failed }), { description: costLabel(res.data.costUsd) });
      setSelected(new Set());
      setPasted("");
      router.refresh();
      onSaved();
    });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4 inline-flex rounded-lg bg-surface-2 p-1 text-sm">
          {(["search", "paste"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium",
                mode === m ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
              )}
            >
              {m === "search" ? <Search className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              {t(m === "search" ? "modeSearch" : "modePaste")}
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("product")} hint={t("productHint")}>
            <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder={t("productPh")} />
          </Field>
          {mode === "search" && (
            <Field label={t("market")}>
              <CountrySelect value={country} onChange={setCountry} pinned={markets} />
            </Field>
          )}
        </div>

        {mode === "search" ? (
          <>
            <div className="mt-4">
              <div className="mb-1.5 text-sm font-medium text-text">{t("roles")}</div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...ROLE_PRESETS, ...roles])).map((r) => {
                  const on = roles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-2",
                      )}
                    >
                      {r}
                    </button>
                  );
                })}
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customRole.trim()) setRoles((rs) => Array.from(new Set([...rs, customRole.trim()])));
                    setCustomRole("");
                  }}
                >
                  <Input className="h-8 w-40" value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder={t("addRole")} />
                  <Button type="submit" size="icon" variant="ghost" className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <Field label={t("extra")} hint={t("extraHint")}>
                <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="food importer, wholesale, grocery" />
              </Field>
              <Button onClick={search} loading={searching} disabled={!product.trim() || !roles.length || !canWrite}>
                {!searching && <Search className="h-4 w-4" />}
                {t("search")}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">{t("searchHint")}</p>
          </>
        ) : (
          <div className="mt-4">
            <Field label={t("pasteLabel")} hint={t("pasteHint", { max: MAX_PER_RUN })}>
              <Textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://www.linkedin.com/in/..." />
            </Field>
          </div>
        )}
      </Card>

      {searching && (
        <Card className="flex items-center justify-center gap-3 p-8 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          {t("searching")}
        </Card>
      )}

      {mode === "search" && result && !searching && (
        <Card>
          <CardHeader
            title={t("results", { count: result.candidates.length })}
            description={<span className="break-all font-mono text-xs">{result.query}</span>}
          />
          {result.candidates.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">{t("noResults")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {result.candidates.map((c) => {
                const on = selected.has(c.url);
                const full = !on && selected.size >= MAX_PER_RUN;
                return (
                  <li key={c.url} className={cn("flex gap-3 px-5 py-3", on && "bg-primary-soft/30")}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={on}
                      disabled={full}
                      onChange={() => {
                        const s = new Set(selected);
                        if (on) s.delete(c.url);
                        else s.add(c.url);
                        setSelected(s);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text">{c.name || "—"}</span>
                        {c.saved && (
                          <Badge tone="success">
                            <Check className="h-3 w-3" />
                            {t("alreadySaved")}
                          </Badge>
                        )}
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-muted hover:text-primary" title="LinkedIn">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      {c.headline && <div className="text-sm text-text/80">{c.headline}</div>}
                      {c.snippet && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{c.snippet}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {canWrite && (mode === "paste" || (result && result.candidates.length > 0)) && (
        <Card className="sticky bottom-4 flex flex-col gap-3 p-4 shadow-lg md:flex-row md:items-center">
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} />
            <Sparkles className="h-4 w-4 text-primary" />
            {t("withAi")}
          </label>
          {withAi && (
            <div className="flex items-center gap-2 text-sm text-muted">
              {t("messageLanguage")}
              <Select className="h-8 w-40" value={messageLanguage} onChange={(e) => setMessageLanguage(e.target.value)}>
                {CONTENT_LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {languageName(l.code, ui)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex-1 text-xs text-muted md:text-right">{t("costHint", { count: Math.min(urls.length, MAX_PER_RUN) })}</div>
          <Button onClick={collect} loading={collecting} disabled={!urls.length || (withAi && !product.trim())}>
            {!collecting && <UserPlus className="h-4 w-4" />}
            {t("collect", { count: Math.min(urls.length, MAX_PER_RUN) })}
          </Button>
        </Card>
      )}
    </div>
  );
}
