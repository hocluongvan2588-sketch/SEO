"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteReport } from "@/app/actions/reports";
import { Button } from "@/components/ui";

export function ReportToolbar({ id, canWrite }: { id: string; canWrite: boolean }) {
  const t = useTranslations("reports");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      {canWrite && (
        <Button
          variant="ghost"
          className="text-danger"
          loading={pending}
          onClick={() =>
            confirm(t("confirmDelete")) &&
            start(async () => {
              const r = await deleteReport(id);
              if (!r.ok) return void toast.error(r.error);
              router.push("/reports");
            })
          }
        >
          <Trash2 className="h-4 w-4" />
          {t("delete")}
        </Button>
      )}
      {/* Trình duyệt xuất PDF chuẩn A4, chữ vector sắc nét */}
      <Button onClick={() => window.print()}>
        <Download className="h-4 w-4" />
        {t("downloadPdf")}
      </Button>
    </div>
  );
}
