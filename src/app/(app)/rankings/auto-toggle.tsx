"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setAutoRankCheck } from "@/app/actions/projects";
import { cn } from "@/lib/utils";

/** Công tắc bật/tắt tự động kiểm tra thứ hạng cho dự án đang chọn. */
export function AutoCheckToggle({ projectId, enabled, disabled }: { projectId: string; enabled: boolean; disabled?: boolean }) {
  const t = useTranslations("rankings");
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          const r = await setAutoRankCheck(projectId, next);
          if (!r.ok) {
            setOn(!next);
            toast.error(r.error);
            return;
          }
          toast.success(next ? t("autoOn") : t("autoOff"));
          router.refresh();
        })
      }
      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium text-text disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-border")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      {t("auto")}
    </button>
  );
}
