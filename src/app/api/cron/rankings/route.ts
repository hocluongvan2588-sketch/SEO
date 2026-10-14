import { NextResponse, type NextRequest } from "next/server";
import { checkKeywordRanks, pickDue, AUTO_SCHEDULE, type DueKeyword } from "@/lib/rank-check";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonthSpend, metered } from "@/lib/usage";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Dừng nhận từ khóa mới sau ~4 phút; phần còn lại để lần chạy sau. */
const TIME_BUDGET_MS = 240_000;

/**
 * Vercel Cron gọi T2, T4, T6 lúc 6:00 giờ Việt Nam (vercel.json).
 * Header: Authorization: Bearer $CRON_SECRET. Thêm ?dry=1 để xem danh sách sẽ kiểm tra mà không tốn phí.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const supabase = createAdminClient();

  // Ngân sách: ≥100% dừng; ≥80% chỉ kiểm tra bài mới đăng/cập nhật; luôn giới hạn theo số tiền còn lại
  const spend = await getMonthSpend(supabase);
  const budget = spend?.brightdata_budget_usd ?? Infinity;
  const spent = spend?.brightdata_usd ?? 0;
  const ratio = budget > 0 ? spent / budget : 1;
  if (ratio >= 1) return finish(supabase, dry, { note: "budget_exceeded" });
  const freshOnly = ratio >= 0.8;
  let allowance = Math.floor((budget - spent) / AUTO_SCHEDULE.maxCostPerKeyword);

  const { data: projects, error } = await supabase.from("projects").select("*").eq("auto_rank_check", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totals = { checked: 0, found: 0, skipped: 0, remaining: 0, cost_usd: 0 };
  const plan: { project: string; due: number }[] = [];

  for (const project of (projects ?? []) as Project[]) {
    const { data: keywords, error: kwError } = await supabase
      .from("keywords")
      .select("id, keyword, locale, country, best_position, priority, status, last_checked_at, content_updated_at")
      .eq("project_id", project.id)
      .neq("status", "ignored")
      .limit(2000);
    if (kwError) return NextResponse.json({ error: kwError.message }, { status: 500 });

    const due = pickDue((keywords ?? []) as DueKeyword[], { freshOnly });
    plan.push({ project: project.domain, due: due.length });
    const batch = due.slice(0, Math.max(0, allowance));
    totals.remaining += due.length - batch.length;
    if (dry || !batch.length) continue;
    if (Date.now() - started > TIME_BUDGET_MS) {
      totals.remaining += batch.length;
      continue;
    }

    const { result, costUsd } = await metered(
      { supabase, userId: null, projectId: project.id, feature: "rankings", providers: ["brightdata"] },
      () => checkKeywordRanks(supabase, project, batch, { concurrency: 4, deadline: started + TIME_BUDGET_MS }),
    );
    allowance -= result.checked + result.skipped;
    totals.checked += result.checked;
    totals.found += result.found;
    totals.skipped += result.skipped;
    totals.remaining += result.remaining;
    totals.cost_usd += costUsd;
  }

  return finish(supabase, dry, { ...totals, note: freshOnly ? "budget_warning_fresh_only" : null }, plan);
}

async function finish(
  supabase: ReturnType<typeof createAdminClient>,
  dry: boolean,
  run: Partial<{ checked: number; found: number; skipped: number; remaining: number; cost_usd: number; note: string | null }>,
  plan: { project: string; due: number }[] = [],
) {
  if (!dry) {
    const { error } = await supabase
      .from("cron_runs")
      .insert({ job: "rankings", finished_at: new Date().toISOString(), ...run });
    if (error) console.error("cron_runs insert failed:", error.message);
  }
  return NextResponse.json({ ok: true, dry, ...run, plan });
}
