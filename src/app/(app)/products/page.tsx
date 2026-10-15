import { getTranslations } from "next-intl/server";
import { NoProject } from "@/components/no-project";
import { Card, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import type { ScanRecord } from "@/app/actions/products";
import { Catalog, type ProductRow } from "./catalog";
import { ScanPanel } from "./scan-panel";

export const maxDuration = 300;

export default async function ProductsPage() {
  const { supabase, active, profile } = await getWorkspace();
  const t = await getTranslations("products");
  if (!active) return <NoProject />;

  const [{ data: products, error }, { data: scan }] = await Promise.all([
    supabase.from("project_products").select("*").eq("project_id", active.id).order("created_at"),
    supabase
      .from("site_scans")
      .select("id, url, created_at, pages, facts, result")
      .eq("project_id", active.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const canWrite = profile?.role !== "viewer";

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { domain: active.domain })} />
      {error ? (
        <Card className="p-6 text-sm text-muted">{t("notReady")}</Card>
      ) : (
        // key theo dự án: đổi dự án → form làm mới với website của dự án mới
        <div key={active.id} className="space-y-6">
          <ScanPanel project={active} latest={(scan as ScanRecord | null) ?? null} canWrite={canWrite} />
          <Catalog projectId={active.id} products={(products ?? []) as ProductRow[]} canWrite={canWrite} />
        </div>
      )}
    </>
  );
}
