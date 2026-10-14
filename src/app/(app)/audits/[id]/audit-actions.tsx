"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAudit, runAudit } from "@/app/actions/audits";
import { Button } from "@/components/ui";

export function RerunButton({ projectId, url }: { projectId: string; url: string }) {
  const t = useTranslations("audits");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await runAudit({ projectId, url, withAi: true });
          if (!res.ok) return void toast.error(res.error);
          router.push(`/audits/${res.data.id}`);
        })
      }
    >
      {!pending && <RefreshCw className="h-4 w-4" />}
      {t("rerun")}
    </Button>
  );
}

export function DeleteAuditButton({ id }: { id: string }) {
  const t = useTranslations("audits");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="text-danger"
      loading={pending}
      onClick={() =>
        confirm(t("confirmDelete")) &&
        start(async () => {
          const res = await deleteAudit(id);
          if (!res.ok) return void toast.error(res.error);
          router.push("/audits");
        })
      }
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
