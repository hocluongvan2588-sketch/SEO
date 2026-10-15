"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { AlertTriangle, BadgeCheck, ExternalLink, FileSearch, Globe, Lightbulb, Save, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { saveScannedProducts, scanWebsite, type ScanRecord } from "@/app/actions/products";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { CountryMultiSelect } from "@/components/ui/country-picker";
import { useCostLabel } from "@/components/use-cost";
import { countryName, flag, languageName } from "@/lib/locales";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ScanPanel({ project, latest, canWrite }: { project: Project; latest: ScanRecord | null; canWrite: boolean }) {
  const t = useTranslations("products");
  const ui = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const costLabel = useCostLabel();
  const [url, setUrl] = useState(latest?.url ?? `https://${project.domain}`);
  const [markets, setMarkets] = useState<string[]>(
    (project.markets ?? []).filter((m) => m !== project.country).slice(0, 3).length
      ? (project.markets ?? []).filter((m) => m !== project.country).slice(0, 3)
      : ["us"],
  );
  const [scan, setScan] = useState<ScanRecord | null>(latest);
  const [pickedProducts, setPickedProducts] = useState<Set<number>>(() => verifiedIdx(latest?.result.products));
  const [pickedCerts, setPickedCerts] = useState<Set<number>>(() => verifiedIdx(latest?.result.certifications));
  const [scanning, startScan] = useTransition();
  const [saving, startSave] = useTransition();

  const run = () =>
    startScan(async () => {
      const id = toast.loading(t("scanning"));
      const r = await scanWebsite({ projectId: project.id, url, markets });
      if (!r.ok) return void toast.error(r.error, { id });
      setScan(r.data.scan);
      setPickedProducts(verifiedIdx(r.data.scan.result.products));
      setPickedCerts(verifiedIdx(r.data.scan.result.certifications));
      toast.success(t("scanned", { count: r.data.scan.facts.pagesRead }), { id, description: costLabel(r.data.costUsd) });
      router.refresh();
    });

  const save = () =>
    startSave(async () => {
      if (!scan) return;
      const r = await saveScannedProducts({ scanId: scan.id, productIndexes: [...pickedProducts], certificationIndexes: [...pickedCerts] });
      if (!r.ok) return void toast.error(r.error);
      toast.success(t("savedProducts", { count: r.data.count }));
      router.refresh();
    });

  const res = scan?.result;
  const rejectedTotal = res ? res.rejected.products + res.rejected.certifications + res.rejected.services : 0;
  const seedsByMarket = res ? Array.from(new Set(res.seeds.map((s) => s.country))) : [];

  return (
    <Card>
      <CardHeader title={t("scanTitle")} description={t("scanDesc")} icon={<FileSearch className="h-4 w-4" />} />
      <div className="grid gap-4 border-b border-border p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <Field label={t("url")}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label={t("markets")} hint={t("marketsHint")}>
          <CountryMultiSelect value={markets} onChange={(m) => setMarkets(m.slice(0, 6))} pinned={project.markets} />
        </Field>
        <Button onClick={run} loading={scanning} disabled={!canWrite || !markets.length || !url}>
          {!scanning && <Search className="h-4 w-4" />}
          {t("scan")}
        </Button>
      </div>

      {!res ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{t("noScan")}</p>
      ) : (
        <div className="space-y-6 p-5">
          {/* Dữ kiện máy đo được + cam kết chống bịa */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-muted">
              {t("scannedAt", { date: format.dateTime(new Date(scan!.created_at), { dateStyle: "medium", timeStyle: "short" }) })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-muted" />
              {t("siteLang")}: <b>{scan!.facts.homeLang ? languageName(scan!.facts.homeLang.slice(0, 2), ui) : "—"}</b>
              {scan!.facts.hreflang.length > 0 && <span className="text-muted">· hreflang: {scan!.facts.hreflang.join(", ")}</span>}
            </span>
            <span>
              {t("businessType")}: <b>{res.business_type}</b>
            </span>
            <details className="text-muted">
              <summary className="cursor-pointer">{t("pagesRead", { count: scan!.pages.length })}</summary>
              <ul className="mt-1 space-y-0.5 text-xs">
                {scan!.pages.map((p) => (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-primary">
                      {p.url}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <div className="flex gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2.5 text-sm text-text">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div>
              {t("verifyNote")}
              {rejectedTotal > 0 && (
                <span className="ml-1 font-medium text-warning">{t("rejected", { count: rejectedTotal })}</span>
              )}
            </div>
          </div>

          {/* Sản phẩm */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-text">{t("foundProducts", { count: res.products.length })}</h3>
            {res.products.length ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2">{t("product")}</th>
                      <th className="px-3 py-2">{t("evidence")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {res.products.map((p, i) => (
                      <tr key={i} className={cn("align-top", !p.verified_url && "bg-warning-soft/40")}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            disabled={!p.verified_url || !canWrite}
                            checked={pickedProducts.has(i)}
                            onChange={() => setPickedProducts(toggle(pickedProducts, i))}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-text">{p.name}</div>
                          <div className="text-xs text-muted">
                            {p.category}
                            {p.details && ` · ${p.details}`}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <EvidenceCell evidence={p.evidence} url={p.verified_url} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("noProducts")}</p>
            )}
          </section>

          {/* Chứng nhận & dịch vụ */}
          <div className="grid gap-4 md:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-text">{t("certifications")}</h3>
              {res.certifications.length ? (
                <ul className="space-y-1.5">
                  {res.certifications.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={!c.verified_url || !canWrite}
                        checked={pickedCerts.has(i)}
                        onChange={() => setPickedCerts(toggle(pickedCerts, i))}
                      />
                      <div className="min-w-0">
                        <span className={cn("font-medium", c.verified_url ? "text-text" : "text-muted line-through")}>{c.name}</span>
                        <EvidenceCell evidence={c.evidence} url={c.verified_url} compact />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("noneOnSite")}</p>
              )}
              <p className="mt-1 text-xs text-muted">{t("certHint")}</p>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-text">{t("services")}</h3>
              {res.services.length ? (
                <ul className="space-y-1.5">
                  {res.services.map((s, i) => (
                    <li key={i} className="text-sm">
                      <span className={cn("font-medium", s.verified_url ? "text-text" : "text-muted line-through")}>{s.name}</span>
                      <EvidenceCell evidence={s.evidence} url={s.verified_url} compact />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("noneOnSite")}</p>
              )}
            </section>
          </div>

          {canWrite && res.products.some((p) => p.verified_url) && (
            <div className="flex justify-end">
              <Button onClick={save} loading={saving} disabled={!pickedProducts.size}>
                <Save className="h-4 w-4" />
                {t("saveSelected", { count: pickedProducts.size })}
              </Button>
            </div>
          )}

          {/* Từ khóa gốc theo thị trường */}
          <section>
            <h3 className="mb-1 text-sm font-semibold text-text">{t("seeds")}</h3>
            <p className="mb-3 text-xs text-muted">{t("seedsHint")}</p>
            {seedsByMarket.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {seedsByMarket.map((m) => (
                  <div key={m} className="rounded-lg border border-border">
                    <div className="border-b border-border bg-surface-2/50 px-3 py-2 text-sm font-medium text-text">
                      {flag(m)} {countryName(m, ui)}
                    </div>
                    <ul className="divide-y divide-border">
                      {res.seeds
                        .filter((s) => s.country === m)
                        .map((s, i) => (
                          <li key={i} className="flex items-start justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="font-medium text-text">
                                {s.keyword} <Badge className="ml-1 align-middle">{s.locale}</Badge>
                              </div>
                              <div className="text-xs text-muted">
                                {s.product !== "*" && <span className="text-primary">{s.product} · </span>}
                                {s.reason}
                              </div>
                            </div>
                            <Link
                              href={`/keywords?tab=research&seed=${encodeURIComponent(s.keyword)}&hl=${s.locale}&gl=${s.country}`}
                              className="shrink-0 text-xs font-medium text-primary hover:underline"
                            >
                              {t("research")} →
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">{t("noSeeds")}</p>
            )}
          </section>

          {res.observations.length > 0 && (
            <section className="rounded-lg bg-surface-2/60 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                <Lightbulb className="h-4 w-4 text-warning" />
                {t("observations")}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-text">
                {res.observations.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}

function EvidenceCell({ evidence, url, compact }: { evidence: string; url: string | null; compact?: boolean }) {
  const t = useTranslations("products");
  return (
    <div className={cn("text-xs", compact ? "mt-0.5" : "")}>
      <q className="italic text-muted">{evidence}</q>
      <div className="mt-0.5 flex items-center gap-2">
        {url ? (
          <>
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <BadgeCheck className="h-3.5 w-3.5" />
              {t("verified")}
            </span>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
              {t("source")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("unverified")}
          </span>
        )}
      </div>
    </div>
  );
}

function verifiedIdx(items?: { verified_url: string | null }[]) {
  return new Set((items ?? []).map((x, i) => (x.verified_url ? i : -1)).filter((i) => i >= 0));
}

function toggle(set: Set<number>, i: number) {
  const s = new Set(set);
  if (s.has(i)) s.delete(i);
  else s.add(i);
  return s;
}
