"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { checkRankings } from "@/app/actions/keywords";
import { Button } from "@/components/ui";

/** Kiểm tra theo lô 25 từ khóa/lần để tránh timeout. */
export function CheckAllButton({ projectId, ids }: { projectId: string; ids: string[] }) {
  const t = useTranslations("rankings");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      loading={pending}
      disabled={!ids.length}
      onClick={() =>
        start(async () => {
          let checked = 0;
          let found = 0;
          const toastId = toast.loading(t("checking", { done: 0, total: ids.length }));
          for (let i = 0; i < ids.length; i += 25) {
            const res = await checkRankings(projectId, ids.slice(i, i + 25));
            if (!res.ok) {
              toast.error(res.error, { id: toastId });
              router.refresh();
              return;
            }
            checked += res.data.checked;
            found += res.data.found;
            toast.loading(t("checking", { done: checked, total: ids.length }), { id: toastId });
          }
          toast.success(t("checkedResult", { checked, found }), { id: toastId });
          router.refresh();
        })
      }
    >
      {!pending && <RefreshCw className="h-4 w-4" />}
      {t("checkAll")}
    </Button>
  );
}
