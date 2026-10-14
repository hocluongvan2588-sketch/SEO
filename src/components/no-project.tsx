import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderPlus } from "lucide-react";
import { buttonClass, Card, EmptyState } from "@/components/ui";

export async function NoProject() {
  const t = await getTranslations("common");
  return (
    <Card>
      <EmptyState
        icon={<FolderPlus className="h-5 w-5" />}
        title={t("noProjectTitle")}
        description={t("noProjectDesc")}
        action={
          <Link href="/projects?new=1" className={buttonClass()}>
            {t("createProject")}
          </Link>
        }
      />
    </Card>
  );
}
