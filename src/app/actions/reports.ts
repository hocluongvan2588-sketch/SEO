"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeReport } from "@/lib/ai";
import { BRAND } from "@/lib/brand";
import { fail, type ActionResult } from "@/lib/context";
import { collectReportData, REPORT_SECTIONS } from "@/lib/report-data";
import { getSession } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { metered } from "@/lib/usage";

const ReportInput = z.object({
  projectId: z.string().uuid(),
  locale: z.enum(["vi", "en"]),
  sections: z.array(z.enum(REPORT_SECTIONS)).min(1),
  validDays: z.number().int().min(7).max(90).default(30),
});

/** Tạo báo cáo đánh giá SEO từ dữ liệu đã có của dự án + AI viết phần nhận định. */
export async function createReport(input: z.input<typeof ReportInput>): Promise<ActionResult<{ id: string; costUsd: number }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const v = ReportInput.parse(input);
    const { data: project, error: pErr } = await session.supabase.from("projects").select("*").eq("id", v.projectId).single();
    if (pErr) throw pErr;

    const data = await collectReportData(session.supabase, project as Project);
    if (!data.audits.length && !data.keywords.length)
      throw new Error("Dự án chưa có dữ liệu: hãy audit vài trang và/hoặc nghiên cứu từ khóa trước khi tạo báo cáo");

    const { result: ai, costUsd } = await metered(
      { supabase: session.supabase, userId: session.user.id, projectId: v.projectId, feature: "report", providers: ["claude"] },
      () => writeReport({ provider: BRAND.company, project: project as Project, locale: v.locale, data }),
    );

    const p = session.profile;
    const contact = {
      name: p?.full_name || session.user.email,
      email: p?.email || session.user.email,
      title: p?.job_title ?? null,
      phone: p?.phone ?? null,
    };
    const today = new Date();
    const valid = new Date(today.getTime() + v.validDays * 864e5);
    const { data: row, error } = await session.supabase
      .from("reports")
      .insert({
        project_id: v.projectId,
        title: `${v.locale === "vi" ? "Báo cáo đánh giá SEO" : "SEO Assessment"} — ${(project as Project).domain}`,
        locale: v.locale,
        sections: v.sections,
        data,
        ai,
        contact,
        valid_until: valid.toISOString().slice(0, 10),
        created_by: session.user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/reports");
    return { ok: true, data: { id: row.id, costUsd } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteReport(id: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("reports").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/reports");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
