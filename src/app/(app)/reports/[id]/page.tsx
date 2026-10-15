import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { getWorkspace } from "@/lib/context";
import type { ReportRecord } from "@/lib/types";
import { ReportDocument } from "./report-document";
import { ReportToolbar } from "./report-toolbar";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  // Tên file PDF mặc định khi "Lưu dưới dạng PDF" = tiêu đề trang
  const { supabase } = await getWorkspace();
  const { data } = await supabase.from("reports").select("title").eq("id", (await params).id).maybeSingle();
  return { title: { absolute: data?.title ?? "Report" } };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await getWorkspace();
  const t = await getTranslations("reports");
  const { data } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const report = data as ReportRecord;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>
        <ReportToolbar id={report.id} canWrite={profile?.role !== "viewer"} />
      </div>
      <p className="mb-4 text-xs text-muted print:hidden">{t("printHint")}</p>
      <ReportDocument report={report} />
    </>
  );
}
