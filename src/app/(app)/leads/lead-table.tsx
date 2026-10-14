"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Copy, Download, ExternalLink, Search, Sparkles, Trash2, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { bulkUpdateLeads, deleteLeads, requalifyLeads, updateLead } from "@/app/actions/leads";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { useCostLabel } from "@/components/use-cost";
import { countryName, flag } from "@/lib/locales";
import type { Lead, LeadStatus, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUSES: LeadStatus[] = ["new", "connected", "messaged", "replied", "opportunity", "not_fit"];

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted">—</span>;
  return (
    <Badge tone={score >= 70 ? "success" : score >= 40 ? "warning" : "neutral"} className="tabular-nums">
      {score}
    </Badge>
  );
}

export function LeadTable({
  project,
  leads,
  staff,
  currentUserId,
  canWrite,
  onFind,
}: {
  project: Project;
  leads: Lead[];
  staff: { id: string; name: string }[];
  currentUserId: string;
  canWrite: boolean;
  onFind: () => void;
}) {
  const t = useTranslations("leads");
  const ui = useLocale();
  const costLabel = useCostLabel();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [score, setScore] = useState("");
  const [owner, setOwner] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return leads.filter(
      (l) =>
        (!query || `${l.name} ${l.headline} ${l.company} ${l.location}`.toLowerCase().includes(query)) &&
        (!status || l.status === status) &&
        (!owner || (owner === "me" ? l.owner_id === currentUserId : owner === "none" ? !l.owner_id : l.owner_id === owner)) &&
        (!score ||
          (score === "high" && (l.ai_score ?? -1) >= 70) ||
          (score === "mid" && (l.ai_score ?? -1) >= 40 && (l.ai_score ?? -1) < 70) ||
          (score === "low" && l.ai_score != null && l.ai_score < 40)),
    );
  }, [leads, q, status, owner, score, currentUserId]);

  const ids = [...selected];
  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const open = leads.find((l) => l.id === openId) ?? null;

  const act = (name: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string, description?: string) => {
    setBusy(name);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(success, { description });
      setSelected(new Set());
      router.refresh();
    });
  };

  const exportCsv = () => {
    const rows = filtered.length ? filtered : leads;
    const head = ["name", "headline", "company", "location", "linkedin_url", "ai_score", "status", "owner", "ai_message", "notes"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      head.join(","),
      ...rows.map((l) =>
        [l.name, l.headline, l.company, l.location, l.linkedin_url, l.ai_score, t(`status.${l.status}`), l.owner_id ? staffName.get(l.owner_id) : "", l.ai_message, l.notes]
          .map(esc)
          .join(","),
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `buyers-${project.domain}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (leads.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={t("empty")}
          description={t("emptyDesc")}
          action={
            <Button onClick={onFind}>
              <Search className="h-4 w-4" />
              {t("tabFind")}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:flex-wrap xl:items-center">
        <div className="relative min-w-64 flex-1">
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
          <Select value={score} onChange={(e) => setScore(e.target.value)} className="sm:w-auto">
            <option value="">{t("allScores")}</option>
            <option value="high">{t("scoreHigh")}</option>
            <option value="mid">{t("scoreMid")}</option>
            <option value="low">{t("scoreLow")}</option>
          </Select>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="sm:w-auto">
            <option value="">{t("allOwners")}</option>
            <option value="me">{t("mine")}</option>
            <option value="none">{t("unassigned")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" size="icon" title={t("exportCsv")} onClick={exportCsv}>
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {canWrite && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft/40 px-4 py-2.5">
          <span className="mr-2 text-sm font-medium text-primary">{t("selected", { count: selected.size })}</span>
          <Select
            className="h-8 w-auto"
            value=""
            onChange={(e) => e.target.value && act("status", () => bulkUpdateLeads(ids, { status: e.target.value as LeadStatus }), t("updated"))}
          >
            <option value="">{t("setStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" loading={busy === "assign"} onClick={() => act("assign", () => bulkUpdateLeads(ids, { owner_id: currentUserId }), t("updated"))}>
            <UserCheck className="h-3.5 w-3.5" />
            {t("assignMe")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "ai"}
            disabled={ids.length > 20}
            title={ids.length > 20 ? t("max20") : undefined}
            onClick={() => {
              setBusy("ai");
              start(async () => {
                const res = await requalifyLeads({ projectId: project.id, ids, product: "", messageLanguage: "en" });
                setBusy(null);
                if (!res.ok) return void toast.error(res.error);
                toast.success(t("requalified", { count: res.data.updated }), { description: costLabel(res.data.costUsd) });
                setSelected(new Set());
                router.refresh();
              });
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("requalify")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            loading={busy === "delete"}
            onClick={() => confirm(t("confirmDelete", { count: ids.length })) && act("delete", () => deleteLeads(ids), t("deleted"))}
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
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((l) => l.id)))} />
                </th>
              )}
              <th className="px-3 py-2.5">{t("colBuyer")}</th>
              <th className="px-3 py-2.5">{t("colCompany")}</th>
              <th className="px-3 py-2.5">{t("colScore")}</th>
              <th className="px-3 py-2.5">{t("colStatus")}</th>
              <th className="px-3 py-2.5">{t("colOwner")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((l) => (
              <tr key={l.id} className={cn("cursor-pointer hover:bg-surface-2/50", selected.has(l.id) && "bg-primary-soft/30")} onClick={() => setOpenId(l.id)}>
                {canWrite && (
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={() => {
                        const s = new Set(selected);
                        if (s.has(l.id)) s.delete(l.id);
                        else s.add(l.id);
                        setSelected(s);
                      }}
                    />
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                      {(l.name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-text">{l.name}</div>
                      <div className="max-w-xs truncate text-xs text-muted">{l.headline}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="max-w-56 truncate text-text">{l.company ?? "—"}</div>
                  <div className="truncate text-xs text-muted">
                    {l.country_code && <span title={countryName(l.country_code, ui)}>{flag(l.country_code)} </span>}
                    {l.location}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <ScoreBadge score={l.ai_score} />
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Select
                    disabled={!canWrite}
                    className="h-8 w-40 text-xs"
                    defaultValue={l.status}
                    onChange={(e) =>
                      start(async () => {
                        const r = await updateLead(l.id, { status: e.target.value as LeadStatus });
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
                <td className="px-3 py-2.5 text-xs text-muted">{(l.owner_id && staffName.get(l.owner_id)) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{t("noMatch")}</p>}
      </div>
      <div className="border-t border-border px-4 py-2.5 text-xs text-muted">{t("showing", { shown: filtered.length, total: leads.length })}</div>

      <Modal open={open !== null} onClose={() => setOpenId(null)} title={open?.name ?? ""} className="max-w-2xl">
        {open && <LeadDetail key={open.id} lead={open} staff={staff} canWrite={canWrite} onClose={() => setOpenId(null)} />}
      </Modal>
    </Card>
  );
}

function LeadDetail({ lead, staff, canWrite, onClose }: { lead: Lead; staff: { id: string; name: string }[]; canWrite: boolean; onClose: () => void }) {
  const t = useTranslations("leads");
  const format = useFormatter();
  const router = useRouter();
  const [message, setMessage] = useState(lead.ai_message ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [pending, start] = useTransition();

  const save = (patch: Parameters<typeof updateLead>[1], msg = t("updated")) =>
    start(async () => {
      const r = await updateLead(lead.id, patch);
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text">{lead.headline}</div>
          <div className="mt-1 text-sm text-muted">
            {lead.company_url ? (
              <a href={lead.company_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {lead.company}
              </a>
            ) : (
              lead.company
            )}
            {lead.location && ` · ${lead.country_code ? flag(lead.country_code) + " " : ""}${lead.location}`}
          </div>
        </div>
        <a
          href={lead.linkedin_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0a66c2] px-3 text-sm font-medium text-white hover:opacity-90"
        >
          <ExternalLink className="h-4 w-4" />
          {t("openLinkedIn")}
        </a>
      </div>

      {(lead.ai_score != null || lead.ai_reason) && (
        <div className="flex gap-3 rounded-lg bg-primary-soft/40 p-3 text-sm">
          <ScoreBadge score={lead.ai_score} />
          <p className="text-text">{lead.ai_reason}</p>
        </div>
      )}

      <Field label={t("message")} hint={t("messageHint", { count: message.length })}>
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} disabled={!canWrite} />
      </Field>
      <div className="-mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(message);
            toast.success(t("copied"));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {t("copy")}
        </Button>
        {canWrite && message !== (lead.ai_message ?? "") && (
          <Button size="sm" loading={pending} onClick={() => save({ ai_message: message })}>
            {t("saveMessage")}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("colStatus")}>
          <Select defaultValue={lead.status} disabled={!canWrite} onChange={(e) => save({ status: e.target.value as LeadStatus })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("colOwner")}>
          <Select defaultValue={lead.owner_id ?? ""} disabled={!canWrite} onChange={(e) => save({ owner_id: e.target.value || null })}>
            <option value="">{t("unassigned")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t("notes")}>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canWrite} placeholder={t("notesPh")} />
      </Field>
      {canWrite && notes !== (lead.notes ?? "") && (
        <Button size="sm" className="-mt-2" loading={pending} onClick={() => save({ notes })}>
          {t("saveNotes")}
        </Button>
      )}

      {lead.experience.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm font-medium text-text">{t("experience")}</div>
          <ul className="space-y-1 text-sm">
            {lead.experience.map((e, i) => (
              <li key={i} className="text-text">
                {e.title} <span className="text-muted">· {e.company}</span>
                {e.duration && <span className="text-xs text-muted"> · {e.duration}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {lead.about && (
        <div>
          <div className="mb-1.5 text-sm font-medium text-text">{t("about")}</div>
          <p className="max-h-40 overflow-y-auto whitespace-pre-line text-sm text-muted">{lead.about}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted">
        <span>
          {t("collectedOn", { date: format.dateTime(new Date(lead.collected_at), { dateStyle: "medium" }) })} ·{" "}
          {t("expiresOn", { date: format.dateTime(new Date(lead.expires_at), { dateStyle: "medium" }) })}
        </span>
        {canWrite && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={() =>
              confirm(t("confirmDeleteOne")) &&
              start(async () => {
                const r = await deleteLeads([lead.id]);
                if (!r.ok) return void toast.error(r.error);
                toast.success(t("deleted"));
                onClose();
                router.refresh();
              })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("deleteOnRequest")}
          </Button>
        )}
      </div>
    </div>
  );
}
