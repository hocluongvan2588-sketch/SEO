import { getTranslations } from "next-intl/server";
import { NoProject } from "@/components/no-project";
import { Card, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import { hostOf } from "@/lib/utils";
import type { ScanRecord } from "@/app/actions/products";
import { Catalog, type ProductRow } from "./catalog";
import { ScanPanel } from "./scan-panel";
import { AdoptScans, ForeignScans, type ForeignScan } from "./scan-housekeeping";

export const maxDuration = 300;

const sameSite = (url: string, domain: string) => {
  const h = hostOf(url);
  const own = hostOf(domain);
  return h === own || h.endsWith(`.${own}`);
};

export default async function ProductsPage() {
  const { supabase, active, profile, projects } = await getWorkspace();
  const t = await getTranslations("products");
  if (!active) return <NoProject />;

  const [{ data: products, error }, { data: scans }, { data: elsewhere }] = await Promise.all([
    supabase.from("project_products").select("*").eq("project_id", active.id).order("created_at"),
    supabase
      .from("site_scans")
      .select("id, url, created_at, pages, facts, result")
      .eq("project_id", active.id)
      .order("created_at", { ascending: false })
      .limit(20),
    // Các lần quét nằm ở dự án khác — để tìm lần quét website này bị lưu nhầm chỗ
    supabase
      .from("site_scans")
      .select("id, url, created_at, project_id")
      .neq("project_id", active.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const list = (scans ?? []) as ScanRecord[];
  // Lần quét gần nhất của chính website dự án — bỏ qua các lần quét nhầm website doanh nghiệp khác
  const latest = list.find((s) => sameSite(s.url, active.domain));

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  // Quét nhầm website khác trong dự án này → gợi ý dự án đúng (nếu đã có) để chuyển sang
  const foreign: ForeignScan[] = list
    .filter((s) => !sameSite(s.url, active.domain))
    .map((s) => {
      const target = projects.find((p) => p.id !== active.id && sameSite(s.url, p.domain));
      return {
        id: s.id,
        url: s.url,
        created_at: s.created_at,
        products: s.result?.products?.length ?? 0,
        target: target ? { id: target.id, name: target.name } : null,
      };
    });
  // Website của dự án này từng bị quét ở dự án khác → cho dùng lại, không tốn phí
  const adoptable = latest
    ? []
    : (elsewhere ?? [])
        .filter((s) => sameSite(s.url, active.domain))
        .slice(0, 1)
        .map((s) => ({ id: s.id, url: s.url, created_at: s.created_at, from: projectName.get(s.project_id) ?? "—" }));
  const canWrite = profile?.role !== "viewer";

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { domain: active.domain })} />
      {error ? (
        <Card className="p-6 text-sm text-muted">{t("notReady")}</Card>
      ) : (
        // key theo dự án: đổi dự án → form làm mới với website của dự án mới
        <div key={active.id} className="space-y-6">
          {canWrite && adoptable.length > 0 && <AdoptScans projectId={active.id} scans={adoptable} />}
          {/* key theo lần quét: khi kết quả được chuyển về / thay đổi, khung quét hiển thị ngay mà không cần tải lại trang */}
          <ScanPanel key={latest?.id ?? "none"} project={active} latest={latest ?? null} canWrite={canWrite} />
          <Catalog projectId={active.id} products={(products ?? []) as ProductRow[]} canWrite={canWrite} />
          {foreign.length > 0 && <ForeignScans projectName={active.name} scans={foreign} canWrite={canWrite} />}
        </div>
      )}
    </>
  );
}
