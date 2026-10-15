import { getTranslations } from "next-intl/server";
import { NoProject } from "@/components/no-project";
import { PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import type { SchemaRecord } from "@/lib/types";
import { SchemaStudio } from "./schema-studio";

export const maxDuration = 300;

export default async function SchemasPage() {
  const { supabase, active, profile } = await getWorkspace();
  const t = await getTranslations("schemas");
  if (!active) return <NoProject />;
  const { data } = await supabase.from("schemas").select("*").eq("project_id", active.id).order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <SchemaStudio key={active.id} project={active} saved={(data ?? []) as SchemaRecord[]} canWrite={profile?.role !== "viewer"} />
    </>
  );
}
