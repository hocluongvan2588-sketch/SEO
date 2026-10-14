import { getTranslations } from "next-intl/server";
import { NoProject } from "@/components/no-project";
import { PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import type { Keyword } from "@/lib/types";
import { KeywordsView } from "./keywords-view";

export const maxDuration = 300;

export default async function KeywordsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, active, profile } = await getWorkspace();
  const t = await getTranslations("keywords");
  const { tab } = await searchParams;
  if (!active) return <NoProject />;

  const [{ data: keywords }, { data: history }] = await Promise.all([
    supabase.from("keywords").select("*").eq("project_id", active.id).order("created_at", { ascending: false }),
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
        history={history ?? []}
        initialTab={tab === "research" ? "research" : "list"}
        canWrite={profile?.role !== "viewer"}
      />
    </>
  );
}
