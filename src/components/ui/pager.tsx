"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Phân trang qua tham số ?page= trên URL (giữ nguyên các bộ lọc khác). */
export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(params.toString());
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const prev = Math.max(1, page - 1);
  const next = Math.min(pages, page + 1);
  return (
    <div className="flex items-center gap-1">
      <Link
        href={href(prev)}
        aria-disabled={page <= 1}
        className={cn(buttonClass("ghost", "sm"), page <= 1 && "pointer-events-none opacity-40")}
        title={t("prevPage")}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="px-1 text-xs tabular-nums text-muted">{t("pageOf", { page, pages })}</span>
      <Link
        href={href(next)}
        aria-disabled={page >= pages}
        className={cn(buttonClass("ghost", "sm"), page >= pages && "pointer-events-none opacity-40")}
        title={t("nextPage")}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
