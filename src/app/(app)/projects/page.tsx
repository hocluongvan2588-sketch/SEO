import { getTranslations } from "next-intl/server";
import { getWorkspace } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { ProjectsView } from "./projects-view";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { projects, active, profile } = await getWorkspace();
  const t = await getTranslations("projects");
  const { new: openNew } = await searchParams;
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ProjectsView
        projects={projects}
        activeId={active?.id ?? null}
        openNew={openNew === "1"}
        canWrite={profile?.role !== "viewer"}
        isAdmin={profile?.role === "admin"}
      />
    </>
  );
}
