"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, Download, Layers, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addKeywordsManually,
  bulkUpdateKeywords,
  checkRankings,
  clusterProjectKeywords,
  deleteKeywords,
  updateKeyword,
} from "@/app/actions/keywords";
import { DifficultyBar, IntentBadge, PositionBadge, PriorityBadge } from "@/components/keyword-bits";
import { Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { localeLabel } from "@/lib/locales";
import type { Keyword, KeywordStatus, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUSES: KeywordStatus[] = ["new", "planned", "writing", "published", "ignored"];

export function KeywordTable({
  project,
  keywords,
  canWrite,
  onResearch,
}: {
  project: Project;
  keywords: Keyword[];
  canWrite: boolean;
  onResearch: () => void;
}) {
  const t = useTranslations("keywords");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [locale, setLocale] = useState("");
  const [priority, setPriority] = useState("");
  const [cluster, setCluster] = useState("");
  const [groupByCluster, setGroupByCluster] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [, start] = useTransition();

  const clusters = useMemo(() => Array.from(new Set(keywords.map((k) => k.cluster).filter(Boolean))) as string[], [keywords]);

  const filtered = useMemo(
    () =>
      keywords.filter(
        (k) =>
          (!q || k.keyword.includes(q.toLowerCase())) &&
          (!status || k.status === status) &&
          (!locale || k.locale === locale) &&
          (!priority || k.priority === priority) &&
          (!cluster || k.cluster === cluster),
      ),
    [keywords, q, status, locale, priority, cluster],
  );

  const groups = useMemo(() => {
    if (!groupByCluster) return [{ name: null as string | null, rows: filtered }];
    const map = new Map<string, Keyword[]>();
    for (const k of filtered) {
      const key = k.cluster ?? "—";
      map.set(key, [...(map.get(key) ?? []), k]);
    }
    return [...map.entries()].map(([name, rows]) => ({ name, rows }));
  }, [filtered, groupByCluster]);

  const ids = [...selected];
  const allSelected = filtered.length > 0 && filtered.every((k) => selected.has(k.id));

  const act = (name: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(name);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(success);
      setSelected(new Set());
      router.refresh();
    });
  };

  const exportCsv = () => {
    const rows = filtered.length ? filtered : keywords;
    const head = ["keyword", "locale", "intent", "difficulty", "priority", "cluster", "content_type", "status", "position", "target_url"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...rows.map((k) => [k.keyword, k.locale, k.intent, k.difficulty, k.priority, k.cluster, k.content_type, k.status, k.current_position, k.target_url].map(esc).join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `keywords-${project.domain}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (keywords.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title={t("empty")}
          description={t("emptyDesc")}
          action={
            <div className="flex gap-2">
              <Button onClick={onResearch}>
                <Sparkles className="h-4 w-4" />
                {t("startResearch")}
              </Button>
              {canWrite && (
                <Button variant="secondary" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t("addManual")}
                </Button>
              )}
            </div>
          }
        />
        <AddModal open={addOpen} onClose={() => setAddOpen(false)} project={project} />
      </Card>
    );
  }

  return (
    <Card>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder={t("searchPh")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-auto">
            <option value="">{t("allStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="sm:w-auto">
            <option value="">{t("allPriority")}</option>
            {(["high", "medium", "low"] as const).map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </Select>
          {project.locales.length > 1 && (
            <Select value={locale} onChange={(e) => setLocale(e.target.value)} className="sm:w-auto">
              <option value="">{t("allLocales")}</option>
              {project.locales.map((l) => (
                <option key={l} value={l}>
                  {localeLabel(l)}
                </option>
              ))}
            </Select>
          )}
          {clusters.length > 0 && (
            <Select value={cluster} onChange={(e) => setCluster(e.target.value)} className="sm:w-auto sm:max-w-48">
              <option value="">{t("allClusters")}</option>
              {clusters.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant={groupByCluster ? "primary" : "secondary"} size="icon" title={t("groupByCluster")} onClick={() => setGroupByCluster((g) => !g)}>
            <Layers className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" title={t("exportCsv")} onClick={exportCsv}>
            <Download className="h-4 w-4" />
          </Button>
          {canWrite && (
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("add")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {canWrite && (
        <div className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft/40 px-4 py-2.5", selected.size === 0 && "hidden")}>
          <span className="mr-2 text-sm font-medium text-primary">{t("selected", { count: selected.size })}</span>
          <Select
            className="h-8 w-auto"
            value=""
            onChange={(e) =>
              e.target.value &&
              act("status", () => bulkUpdateKeywords(ids, { status: e.target.value as KeywordStatus }), t("updated"))
            }
          >
            <option value="">{t("setStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "rank"}
            onClick={() =>
              act(
                "rank",
                async () => {
                  const r = await checkRankings(project.id, ids);
                  if (r.ok) toast.info(t("rankResult", { checked: r.data.checked, found: r.data.found }));
                  return r;
                },
                t("rankDone"),
              )
            }
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {t("checkRank")}
          </Button>
          <Button size="sm" variant="secondary" loading={busy === "cluster"} onClick={() => act("cluster", () => clusterProjectKeywords(project.id, ids), t("clustered"))}>
            <Sparkles className="h-3.5 w-3.5" />
            {t("aiCluster")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            loading={busy === "delete"}
            onClick={() => confirm(t("confirmDelete", { count: ids.length })) && act("delete", () => deleteKeywords(ids), t("deleted"))}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("delete")}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              {canWrite && (
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((k) => k.id)))}
                  />
                </th>
              )}
              <th className="px-3 py-2.5">{t("colKeyword")}</th>
              <th className="px-3 py-2.5">{t("colIntent")}</th>
              <th className="px-3 py-2.5">{t("colDifficulty")}</th>
              <th className="px-3 py-2.5">{t("colPriority")}</th>
              <th className="px-3 py-2.5">{t("colPosition")}</th>
              <th className="px-3 py-2.5">{t("colStatus")}</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.name ?? "all"} className="divide-y divide-border">
              {g.name && (
                <tr className="bg-surface-2/40">
                  <td colSpan={7} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary">
                    {g.name} · {g.rows.length}
                  </td>
                </tr>
              )}
              {g.rows.map((k) => (
                <tr key={k.id} className={cn("hover:bg-surface-2/50", selected.has(k.id) && "bg-primary-soft/30")}>
                  {canWrite && (
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(k.id)}
                        onChange={() => {
                          const s = new Set(selected);
                          if (s.has(k.id)) s.delete(k.id);
                          else s.add(k.id);
                          setSelected(s);
                        }}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-text">{k.keyword}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      {project.locales.length > 1 && <span className="uppercase">{k.locale}</span>}
                      {k.cluster && !groupByCluster && <span>· {k.cluster}</span>}
                      {k.target_url && (
                        <a href={k.target_url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                          · {k.target_url.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </div>
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
                  <td className="px-3 py-2.5">
                    <PositionBadge position={k.current_position} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Select
                      disabled={!canWrite}
                      className="h-8 w-36 text-xs"
                      defaultValue={k.status}
                      onChange={(e) =>
                        start(async () => {
                          const r = await updateKeyword(k.id, { status: e.target.value as KeywordStatus });
                          if (!r.ok) toast.error(r.error);
                        })
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{t("noMatch")}</p>}
      </div>
      <div className="border-t border-border px-4 py-2.5 text-xs text-muted">
        {t("showing", { shown: filtered.length, total: keywords.length })}
      </div>

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} project={project} />
    </Card>
  );
}

function AddModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const t = useTranslations("keywords");
  const router = useRouter();
  const [text, setText] = useState("");
  const [locale, setLocale] = useState(project.default_locale);
  const [pending, start] = useTransition();
  return (
    <Modal open={open} onClose={onClose} title={t("addManual")}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await addKeywordsManually({ projectId: project.id, locale, keywords: text.split(/\n|,/) });
            if (!res.ok) return void toast.error(res.error);
            toast.success(t("added", { count: res.data.count }));
            setText("");
            onClose();
            router.refresh();
          });
        }}
      >
        <Field label={t("addLabel")} hint={t("addHint")}>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} required />
        </Field>
        <Field label={t("language")}>
          <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
            {project.locales.map((l) => (
              <option key={l} value={l}>
                {localeLabel(l)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            {t("add")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
