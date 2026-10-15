import { getTranslations } from "next-intl/server";
import { NoProject } from "@/components/no-project";
import { PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import { applyKeywordFilters, readFilters } from "@/lib/keyword-filters";
import { PAGE_SIZE, pageOf } from "@/lib/paging";
import type { Keyword } from "@/lib/types";
import { KeywordsView } from "./keywords-view";

export const maxDuration = 300;

export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, active, profile } = await getWorkspace();
  const t = await getTranslations("keywords");
  const params = await searchParams;
  if (!active) return <NoProject />;

  const filters = readFilters(params);
  const page = pageOf(params.page as string | undefined);
  const from = (page - 1) * PAGE_SIZE;

  // Lọc + phân trang ngay trong database: mỗi lần chỉ tải 100 dòng dù dự án có hàng nghìn từ khóa
  let list = applyKeywordFilters(
    supabase.from("keywords").select("*", { count: "exact" }).eq("project_id", active.id),
    filters,
  );
  list = filters.group === "cluster"
    ? list.order("cluster", { ascending: true, nullsFirst: false }).order("keyword")
    : list.order("created_at", { ascending: false }).order("id");

  const [{ data: keywords, count }, { data: stats }, { data: facets }, { data: history }] = await Promise.all([
    list.range(from, from + PAGE_SIZE - 1),
    supabase.rpc("keyword_stats", { p_project: active.id }).maybeSingle<{ total: number }>(),
    supabase.rpc("keyword_facets", { p_project: active.id }).maybeSingle<{ countries: string[]; clusters: string[] }>(),
    supabase
      .from("keyword_research")
      .select("id, seed, locale, country, created_at")
      .eq("project_id", active.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { project: active.name })} />
      <KeywordsView
        project={active}
        keywords={(keywords ?? []) as Keyword[]}
        total={stats?.total ?? count ?? 0}
        matched={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        filters={filters}
        facets={{ countries: facets?.countries ?? [], clusters: facets?.clusters ?? [] }}
        history={history ?? []}
        initialTab={params.tab === "research" ? "research" : "list"}
        prefill={
          typeof params.seed === "string"
            ? { seed: params.seed, locale: (params.hl as string) || undefined, country: (params.gl as string) || undefined }
            : undefined
        }
        canWrite={profile?.role !== "viewer"}
      />
    </>
  );
}
