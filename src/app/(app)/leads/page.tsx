import { getTranslations } from "next-intl/server";
import { NoProject } from "@/components/no-project";
import { PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import type { Lead } from "@/lib/types";
import { LeadsView } from "./leads-view";

export const maxDuration = 300;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, active, profile, user } = await getWorkspace();
  const t = await getTranslations("leads");
  const { tab } = await searchParams;
  if (!active) return <NoProject />;

  // Hết hạn lưu trữ 12 tháng → xóa (bỏ qua nếu migration 0005 chưa chạy)
  await supabase.rpc("purge_expired_leads");

  const [{ data: leads, error }, { data: staff }] = await Promise.all([
    supabase.from("leads").select("*").eq("project_id", active.id).order("created_at", { ascending: false }).limit(2000),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { project: active.name })} />
      <LeadsView
        project={active}
        leads={(leads ?? []) as Lead[]}
        staff={(staff ?? []).map((s) => ({ id: s.id, name: s.full_name || s.email }))}
        currentUserId={user.id}
        initialTab={tab === "find" ? "find" : "list"}
        canWrite={profile?.role !== "viewer"}
        notReady={Boolean(error)}
      />
    </>
  );
}
