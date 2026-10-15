"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProduct, saveProduct } from "@/app/actions/products";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/modal";

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  details: string | null;
  certifications: string[];
  source: "manual" | "website";
  source_url: string | null;
  evidence: string | null;
}

export function Catalog({ projectId, products, canWrite }: { projectId: string; products: ProductRow[]; canWrite: boolean }) {
  const t = useTranslations("products");
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [, start] = useTransition();

  return (
    <Card>
      <CardHeader
        title={t("catalog", { count: products.length })}
        description={t("catalogDesc")}
        icon={<Package className="h-4 w-4" />}
        action={
          canWrite && (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" />
              {t("add")}
            </Button>
          )
        }
      />
      {products.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2.5">{t("product")}</th>
                <th className="px-3 py-2.5">{t("certifications")}</th>
                <th className="px-3 py-2.5">{t("sourceCol")}</th>
                <th className="w-20 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-5 py-2.5">
                    <div className="font-medium text-text">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.category}
                      {p.details && ` · ${p.details}`}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {p.certifications.length ? p.certifications.map((c) => <Badge key={c}>{c}</Badge>) : <span className="text-muted">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {p.source === "website" && p.source_url ? (
                      <a href={p.source_url} target="_blank" rel="noreferrer" title={p.evidence ?? ""} className="inline-flex items-center gap-1 text-primary hover:underline">
                        {t("fromWebsite")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted">{t("manual")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {canWrite && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title={t("edit")} onClick={() => setEditing(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-danger"
                          title={t("delete")}
                          onClick={() =>
                            confirm(t("confirmDelete", { name: p.name })) &&
                            start(async () => {
                              const r = await deleteProduct(p.id);
                              if (!r.ok) return void toast.error(r.error);
                              router.refresh();
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Package className="h-5 w-5" />} title={t("emptyCatalog")} description={t("emptyCatalogDesc")} />
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("add") : t("edit")}>
        {editing !== null && <ProductForm projectId={projectId} product={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </Card>
  );
}

function ProductForm({ projectId, product, onDone }: { projectId: string; product: ProductRow | null; onDone: () => void }) {
  const t = useTranslations("products");
  const router = useRouter();
  const [v, setV] = useState({
    name: product?.name ?? "",
    category: product?.category ?? "",
    details: product?.details ?? "",
    certs: product?.certifications.join(", ") ?? "",
  });
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveProduct(
            projectId,
            { name: v.name, category: v.category, details: v.details, certifications: v.certs.split(",").map((c) => c.trim()).filter(Boolean) },
            product?.id,
          );
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("saved"));
          onDone();
          router.refresh();
        });
      }}
    >
      <Field label={t("name")}>
        <Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={t("namePh")} />
      </Field>
      <Field label={t("category")}>
        <Input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
      </Field>
      <Field label={t("details")} hint={t("detailsHint")}>
        <Textarea rows={3} value={v.details} onChange={(e) => setV({ ...v, details: e.target.value })} />
      </Field>
      <Field label={t("certifications")} hint={t("certsHint")}>
        <Input value={v.certs} onChange={(e) => setV({ ...v, certs: e.target.value })} placeholder="ISO 22716, CGMP-ASEAN" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
