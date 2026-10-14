"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Briefcase, CheckCircle2, ExternalLink, FolderKanban, Globe2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProject, saveProject, type ProjectInput } from "@/app/actions/projects";
import { setActiveProject } from "@/app/actions/preferences";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { CONTENT_LOCALES, countryName, flag, languageName } from "@/lib/locales";
import { CountryMultiSelect, CountrySelect } from "@/components/ui/country-picker";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProjectsView({
  projects,
  activeId,
  openNew,
  canWrite,
  isAdmin,
}: {
  projects: Project[];
  activeId: string | null;
  openNew: boolean;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("projects");
  const ui = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<Project | "new" | null>(openNew ? "new" : null);
  const [, start] = useTransition();

  /** Bấm vào thẻ: chọn dự án và mở trang Tổng quan của dự án đó */
  const openProject = (p: Project) =>
    start(async () => {
      if (p.id !== activeId) await setActiveProject(p.id);
      router.push("/");
      router.refresh();
    });

  return (
    <>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t("new")}
          </Button>
        </div>
      )}

      {projects.length === 0 ? (
        <Card>
          <EmptyState icon={<FolderKanban className="h-5 w-5" />} title={t("empty")} description={t("emptyDesc")} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              role="link"
              tabIndex={0}
              title={t("open")}
              onClick={() => openProject(p)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  openProject(p);
                }
              }}
              className={cn(
                "group flex min-w-0 cursor-pointer flex-col p-5 transition-all hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary",
                p.id === activeId && "border-primary ring-2 ring-primary/15",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1 font-semibold text-text">
                    <span className="truncate">{p.name}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                  </h3>
                  <a
                    href={`https://${p.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex max-w-full items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <span className="truncate">{p.domain}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                {p.id === activeId && (
                  <Badge tone="primary" className="shrink-0">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("active")}
                  </Badge>
                )}
              </div>
              {p.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{p.description}</p>}
              <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
                <Badge title={(p.markets?.length ? p.markets : [p.country]).map((m) => countryName(m, ui)).join(", ")}>
                  <Globe2 className="h-3 w-3" />
                  {(p.markets?.length ? p.markets : [p.country]).map((m) => flag(m)).join(" ")}
                </Badge>
                {p.locales.map((l) => (
                  <Badge key={l} tone={l === p.default_locale ? "info" : "neutral"}>
                    {languageName(l, ui)}
                  </Badge>
                ))}
              </div>
              {p.industry && (
                <p className="mt-2 line-clamp-2 text-xs text-muted" title={p.industry}>
                  <Briefcase className="mr-1 inline h-3 w-3 align-[-2px]" />
                  {p.industry}
                </p>
              )}
              <div className="mt-auto flex gap-2 pt-4" onClick={(e) => e.stopPropagation()}>
                {canWrite && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {t("edit")}
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-danger hover:text-danger"
                    title={t("delete")}
                    onClick={() => {
                      if (!confirm(t("confirmDelete", { name: p.name }))) return;
                      start(async () => {
                        const res = await deleteProject(p.id);
                        if (!res.ok) toast.error(res.error);
                        else router.refresh();
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("new") : t("edit")}>
        {editing !== null && (
          <ProjectForm
            project={editing === "new" ? null : editing}
            onDone={() => {
              setEditing(null);
              router.replace("/projects");
              router.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function ProjectForm({ project, onDone }: { project: Project | null; onDone: () => void }) {
  const t = useTranslations("projects");
  const ui = useLocale();
  const [pending, start] = useTransition();
  const [langQuery, setLangQuery] = useState("");
  const [form, setForm] = useState<ProjectInput>({
    name: project?.name ?? "",
    domain: project?.domain ?? "",
    description: project?.description ?? "",
    industry: project?.industry ?? "",
    default_locale: project?.default_locale ?? "vi",
    locales: project?.locales ?? ["vi"],
    country: project?.country ?? "vn",
    markets: project?.markets?.length ? project.markets : [project?.country ?? "vn"],
  });
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleLocale = (code: string) => {
    if (code === form.default_locale) return;
    set("locales", form.locales.includes(code) ? form.locales.filter((l) => l !== code) : [...form.locales, code]);
  };

  const languages = CONTENT_LOCALES.map((l) => ({ code: l.code, name: languageName(l.code, ui) }));
  const shownLanguages = languages.filter(
    (l) => form.locales.includes(l.code) || !langQuery || l.name.toLowerCase().includes(langQuery.toLowerCase()) || l.code.toLowerCase().includes(langQuery.toLowerCase()),
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveProject(form, project?.id);
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("saved"));
          onDone();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")}>
          <Input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Công ty ABC" />
        </Field>
        <Field label={t("domain")}>
          <Input required value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="abc.com.vn" />
        </Field>
      </div>
      <Field label={t("industry")}>
        <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder={t("industryPh")} />
      </Field>
      <Field label={t("description")} hint={t("descriptionHint")}>
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("defaultLocale")}>
          <Select
            value={form.default_locale}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, default_locale: v, locales: Array.from(new Set([v, ...f.locales])) }));
            }}
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("country")}>
          <CountrySelect
            value={form.country}
            pinned={form.markets}
            onChange={(c) => setForm((f) => ({ ...f, country: c, markets: Array.from(new Set([c, ...f.markets])) }))}
          />
        </Field>
      </div>
      <Field label={t("markets")} hint={t("marketsHint")}>
        <CountryMultiSelect value={form.markets} locked={[form.country]} onChange={(m) => set("markets", m)} />
      </Field>
      <Field label={t("locales")} hint={t("localesHint")}>
        <Input className="mb-2 h-9" placeholder={t("searchLanguage")} value={langQuery} onChange={(e) => setLangQuery(e.target.value)} />
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {shownLanguages.map((l) => {
            const on = form.locales.includes(l.code);
            return (
              <button
                type="button"
                key={l.code}
                onClick={() => toggleLocale(l.code)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-2",
                  l.code === form.default_locale && "cursor-default",
                )}
              >
                {l.name}
              </button>
            );
          })}
        </div>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
