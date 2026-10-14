"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { checkRankings, listTrackableKeywordIds } from "@/app/actions/keywords";
import { Button } from "@/components/ui";
import { useCostLabel } from "@/components/use-cost";

/** Kiểm tra theo lô 25 từ khóa/lần để tránh timeout. */
export function CheckAllButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  const t = useTranslations("rankings");
  const router = useRouter();
  const costLabel = useCostLabel();
  const [pending, start] = useTransition();
  return (
    <Button
      loading={pending}
      disabled={disabled}
      onClick={() =>
        start(async () => {
          // Lấy id của mọi từ khóa (không chỉ trang đang xem)
          const list = await listTrackableKeywordIds(projectId);
          if (!list.ok) return void toast.error(list.error);
          const ids = list.data;
          let checked = 0;
          let found = 0;
          let skipped = 0;
          let cost = 0;
          let lastError = "";
          const toastId = toast.loading(t("checking", { done: 0, total: ids.length }));
          for (let i = 0; i < ids.length; i += 25) {
            const batch = ids.slice(i, i + 25);
            const res = await checkRankings(projectId, batch);
            // Lô lỗi (vd. Bright Data tạm khóa) → ghi nhận rồi chạy tiếp lô sau
            if (!res.ok) {
              skipped += batch.length;
              lastError = res.error;
            } else {
              checked += res.data.checked;
              found += res.data.found;
              skipped += res.data.skipped;
              cost += res.data.costUsd;
            }
            toast.loading(t("checking", { done: checked + skipped, total: ids.length }), { id: toastId });
          }
          if (checked === 0) toast.error(lastError || t("allSkipped"), { id: toastId });
          else if (skipped > 0)
            toast.warning(t("checkedResult", { checked, found }), {
              id: toastId,
              description: [t("skipped", { count: skipped }), costLabel(cost)].filter(Boolean).join(" · "),
            });
          else toast.success(t("checkedResult", { checked, found }), { id: toastId, description: costLabel(cost) });
          router.refresh();
        })
      }
    >
      {!pending && <RefreshCw className="h-4 w-4" />}
      {t("checkAll")}
    </Button>
  );
}
