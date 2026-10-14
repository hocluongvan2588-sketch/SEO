"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Braces, Check, Copy, ExternalLink, FileCode2, Plus, Save, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteSchema, generateSchemaFromUrl, saveSchema } from "@/app/actions/schemas";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { localeLabel } from "@/lib/locales";
import { buildJsonLd, SCHEMA_TEMPLATES, type SchemaInput } from "@/lib/schema-templates";
import type { Project, SchemaRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type Pair = { a: string; b: string };

export function SchemaStudio({ project, saved, canWrite }: { project: Project; saved: SchemaRecord[]; canWrite: boolean }) {
  const t = useTranslations("schemas");
  const tf = useTranslations("schemas.fields");
  const format = useFormatter();
  const router = useRouter();
  const [mode, setMode] = useState<"template" | "ai">("template");
  const [type, setType] = useState("Organization");
  const [locale, setLocale] = useState(project.default_locale);
  const [name, setName] = useState("");
  const [values, setValues] = useState<SchemaInput>({ name: project.name, url: `https://${project.domain}` });
  const [aiUrl, setAiUrl] = useState(`https://${project.domain}/`);
  const [aiResult, setAiResult] = useState<{ schemaType: string; name: string; jsonLd: Record<string, unknown>; notes: string } | null>(null);
  const [generating, startGen] = useTransition();
  const [saving, startSave] = useTransition();

  const template = SCHEMA_TEMPLATES.find((x) => x.type === type)!;
  const jsonLd = useMemo(
    () =>
      mode === "ai"
        ? aiResult?.jsonLd ?? null
        : buildJsonLd(type, values, { locale, orgName: project.name, orgUrl: `https://${project.domain}` }),
    [mode, aiResult, type, values, locale, project],
  );
  const code = jsonLd ? `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>` : "";

  const set = (k: string, v: SchemaInput[string]) => setValues((s) => ({ ...s, [k]: v }));

  const save = () =>
    startSave(async () => {
      if (!jsonLd) return;
      const res = await saveSchema({
        projectId: project.id,
        name: name || (mode === "ai" ? aiResult?.name ?? "" : String(values.name ?? values.headline ?? type)),
        schemaType: mode === "ai" ? aiResult?.schemaType ?? "Thing" : type,
        locale,
        input: mode === "ai" ? { url: aiUrl } : values,
        jsonLd,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("saved"));
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Builder */}
        <Card>
          <div className="flex border-b border-border">
            {(["template", "ai"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-sm font-medium",
                  mode === m ? "border-primary text-primary" : "border-transparent text-muted hover:text-text",
                )}
              >
                {m === "template" ? <FileCode2 className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
                {t(m === "template" ? "modeTemplate" : "modeAi")}
              </button>
            ))}
          </div>

          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {mode === "template" && (
                <Field label={t("type")}>
                  <Select value={type} onChange={(e) => setType(e.target.value)}>
                    {SCHEMA_TEMPLATES.map((x) => (
                      <option key={x.type} value={x.type}>
                        {x.type}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={t("language")}>
                <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
                  {project.locales.map((l) => (
                    <option key={l} value={l}>
                      {localeLabel(l)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {mode === "template" ? (
              template.fields.map((f) => {
                const label = tf(f.key) + (f.required ? " *" : "");
                if (f.kind === "faq" || f.kind === "breadcrumb")
                  return (
                    <PairsEditor
                      key={f.key}
                      label={label}
                      aLabel={tf(f.kind === "faq" ? "question" : "crumbName")}
                      bLabel={tf(f.kind === "faq" ? "answer" : "crumbUrl")}
                      multiline={f.kind === "faq"}
                      value={(values[f.key] as Pair[]) ?? [{ a: "", b: "" }]}
                      onChange={(v) => set(f.key, v)}
                    />
                  );
                if (f.kind === "list")
                  return (
                    <Field key={f.key} label={label} hint={t("listHint")}>
                      <Textarea
                        rows={3}
                        value={((values[f.key] as string[]) ?? []).join("\n")}
                        onChange={(e) => set(f.key, e.target.value.split("\n"))}
                      />
                    </Field>
                  );
                if (f.kind === "textarea")
                  return (
                    <Field key={f.key} label={label}>
                      <Textarea value={(values[f.key] as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                    </Field>
                  );
                return (
                  <Field key={f.key} label={label}>
                    <Input
                      type={f.kind === "url" ? "url" : "text"}
                      value={(values[f.key] as string) ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  </Field>
                );
              })
            ) : (
              <>
                <Field label={t("pageUrl")} hint={t("aiHint")}>
                  <Input value={aiUrl} onChange={(e) => setAiUrl(e.target.value)} />
                </Field>
                <Button
                  className="w-full"
                  loading={generating}
                  disabled={!canWrite}
                  onClick={() =>
                    startGen(async () => {
                      const res = await generateSchemaFromUrl({ projectId: project.id, url: aiUrl, locale });
                      if (!res.ok) return void toast.error(t("failed"), { description: res.error });
                      setAiResult(res.data);
                      setName(res.data.name);
                    })
                  }
                >
                  {!generating && <Sparkles className="h-4 w-4" />}
                  {generating ? t("generating") : t("generate")}
                </Button>
                {aiResult?.notes && (
                  <div className="rounded-lg bg-warning-soft p-3 text-sm text-text">
                    <div className="mb-1 font-medium">{t("todo")}</div>
                    <p className="whitespace-pre-line text-muted">{aiResult.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Preview */}
        <Card className="flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
          <CardHeader
            title={t("preview")}
            icon={<Braces className="h-4 w-4" />}
            action={
              <div className="flex gap-2">
                <CopyButton text={code} disabled={!jsonLd} />
                <a
                  href="https://search.google.com/test/rich-results"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-sm text-text hover:bg-surface-2"
                  title={t("test")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            }
          />
          <pre className="min-h-64 flex-1 overflow-auto bg-surface-2/50 p-5 font-mono text-xs leading-relaxed text-text">
            {code || <span className="text-muted">{t("previewEmpty")}</span>}
          </pre>
          {canWrite && (
            <div className="flex gap-2 border-t border-border p-4">
              <Input placeholder={t("namePh")} value={name} onChange={(e) => setName(e.target.value)} />
              <Button onClick={save} loading={saving} disabled={!jsonLd}>
                <Save className="h-4 w-4" />
                {t("save")}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Library */}
      <Card>
        <CardHeader title={t("library", { count: saved.length })} />
        {saved.length === 0 ? (
          <EmptyState icon={<Braces className="h-5 w-5" />} title={t("libraryEmpty")} />
        ) : (
          <ul className="divide-y divide-border">
            {saved.map((s) => (
              <SavedRow key={s.id} s={s} canWrite={canWrite} date={format.dateTime(new Date(s.created_at), { dateStyle: "medium" })} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SavedRow({ s, canWrite, date }: { s: SchemaRecord; canWrite: boolean; date: string }) {
  const t = useTranslations("schemas");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const code = `<script type="application/ld+json">\n${JSON.stringify(s.json_ld, null, 2)}\n</script>`;
  return (
    <li className="px-5 py-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <div className="truncate font-medium text-text">{s.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <Badge tone="primary">{s.schema_type}</Badge>
            <Badge>{s.locale.toUpperCase()}</Badge>
            {date}
          </div>
        </button>
        <CopyButton text={code} />
        {canWrite && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            loading={pending}
            onClick={() =>
              confirm(t("confirmDelete")) &&
              start(async () => {
                const r = await deleteSchema(s.id);
                if (!r.ok) toast.error(r.error);
                else router.refresh();
              })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {open && <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-surface-2/60 p-4 font-mono text-xs text-text">{code}</pre>}
    </li>
  );
}

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const t = useTranslations("schemas");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={disabled}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(t("copied"));
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {t("copy")}
    </Button>
  );
}

function PairsEditor({
  label,
  aLabel,
  bLabel,
  multiline,
  value,
  onChange,
}: {
  label: string;
  aLabel: string;
  bLabel: string;
  multiline?: boolean;
  value: Pair[];
  onChange: (v: Pair[]) => void;
}) {
  const t = useTranslations("schemas");
  const update = (i: number, patch: Partial<Pair>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-text">{label}</div>
      <div className="space-y-3">
        {value.map((p, i) => (
          <div key={i} className="relative rounded-lg border border-border p-3 pr-10">
            <Input placeholder={aLabel} value={p.a} onChange={(e) => update(i, { a: e.target.value })} />
            {multiline ? (
              <Textarea className="mt-2 min-h-16" placeholder={bLabel} value={p.b} onChange={(e) => update(i, { b: e.target.value })} />
            ) : (
              <Input className="mt-2" placeholder={bLabel} value={p.b} onChange={(e) => update(i, { b: e.target.value })} />
            )}
            {value.length > 1 && (
              <button
                type="button"
                className="absolute right-2 top-2 rounded p-1 text-muted hover:bg-surface-2"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => onChange([...value, { a: "", b: "" }])}>
        <Plus className="h-3.5 w-3.5" />
        {t("addItem")}
      </Button>
    </div>
  );
}
