"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRightLeft, History, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteScan, moveScan } from "@/app/actions/products";
import { Button, Card, CardHeader } from "@/components/ui";
import { hostOf } from "@/lib/utils";

export interface ForeignScan {
  id: string;
  url: string;
  created_at: string;
  products: number;
  /** Dự án có domain trùng website đã quét (nếu có) */
  target: { id: string; name: string } | null;
}

/** Website khác bị quét trong dự án này: chuyển sang đúng dự án hoặc xóa. */
export function ForeignScans({ projectName, scans, canWrite }: { projectName: string; scans: ForeignScan[]; canWrite: boolean }) {
  const t = useTranslations("products");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(done);
      router.refresh();
    });

  return (
    <Card>
      <CardHeader title={t("foreignTitle", { count: scans.length })} description={t("foreignDesc", { project: projectName })} icon={<History className="h-4 w-4" />} />
      <ul className="divide-y divide-border">
        {scans.map((s) => {
          const host = hostOf(s.url);
          return (
            <li key={s.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium text-text">{host}</div>
                <div className="text-xs text-muted">
                  {format.dateTime(new Date(s.created_at), { dateStyle: "medium", timeStyle: "short" })} · {t("foundCount", { count: s.products })}
                </div>
              </div>
              {canWrite && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {s.target ? (
                    <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => moveScan(s.id, s.target!.id), t("moved", { name: s.target!.name }))}>
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      {t("moveTo", { name: s.target.name })}
                    </Button>
                  ) : (
                    <Link
                      href={`/projects?new=1&domain=${encodeURIComponent(host)}&next=/products`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text hover:bg-surface-2"
                    >
                      {t("createProjectFor", { host })}
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    loading={pending}
                    onClick={() => confirm(t("confirmDeleteScan", { host })) && run(() => deleteScan(s.id), t("scanDeleted"))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("delete")}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Website của dự án này từng được quét ở dự án khác → dùng lại kết quả, không tốn phí. */
export function AdoptScans({ projectId, scans }: { projectId: string; scans: { id: string; url: string; created_at: string; from: string }[] }) {
  const t = useTranslations("products");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const s = scans[0];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/50 px-4 py-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2">
        <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          {t("adoptText", {
            host: hostOf(s.url),
            from: s.from,
            date: format.dateTime(new Date(s.created_at), { dateStyle: "medium", timeStyle: "short" }),
          })}
        </span>
      </div>
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await moveScan(s.id, projectId);
            if (!r.ok) return void toast.error(r.error);
            toast.success(t("adopted"));
            router.refresh();
          })
        }
      >
        {t("adopt")}
      </Button>
    </div>
  );
}
