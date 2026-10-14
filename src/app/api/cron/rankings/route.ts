import { NextResponse, type NextRequest } from "next/server";
import { fetchAll } from "@/lib/paging";
import { AUTO_SCHEDULE, checkKeywordRanks, pickDue, Semaphore, type DueKeyword } from "@/lib/rank-check";
import { createAdminClient } from "@/lib/supabase/admin";
import { BudgetExceededError, getMonthSpend, getProjectSpend, metered } from "@/lib/usage";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Dừng nhận từ khóa mới sau ~4 phút; phần còn lại để lần chạy sau (cron chạy mỗi ngày). */
const TIME_BUDGET_MS = 240_000;
/** Tổng số từ khóa kiểm tra cùng lúc cho mọi dự án */
const MAX_PARALLEL = 6;

/**
 * Vercel Cron gọi mỗi ngày lúc 6:00 giờ Việt Nam (vercel.json). Quy tắc "đến hạn" (pickDue) quyết định
 * từ khóa nào được kiểm tra: thường 1 lần/tuần, bài mới đăng/cập nhật 3 lần/tuần — chạy mỗi ngày chỉ để
 * rải việc ra, không làm tăng số lần kiểm tra mỗi từ khóa.
 * Các dự án chạy song song và lần lượt chia nhau suất kiểm tra (hàng đợi FIFO) → dự án nào cũng được phục vụ.
 * Header: Authorization: Bearer $CRON_SECRET. Thêm ?dry=1 để xem kế hoạch mà không tốn phí.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const supabase = createAdminClient();

  // Ngân sách chung: ≥100% dừng; ≥80% chỉ kiểm tra bài mới đăng/cập nhật; luôn giới hạn theo số tiền còn lại
  const spend = await getMonthSpend(supabase);
  const budget = spend?.brightdata_budget_usd ?? Infinity;
  const spent = spend?.brightdata_usd ?? 0;
  const ratio = budget > 0 ? spent / budget : 1;
  if (ratio >= 1) return finish(supabase, dry, { note: "budget_exceeded" });
  const freshOnly = ratio >= 0.8;
  let allowance = Math.floor((budget - spent) / AUTO_SCHEDULE.maxCostPerKeyword);

  const { data: projects, error } = await supabase.from("projects").select("*").eq("auto_rank_check", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const limiter = new Semaphore(MAX_PARALLEL);
  const totals = { checked: 0, found: 0, skipped: 0, remaining: 0, cost_usd: 0 };
  const plan: { project: string; due: number; checked?: number; note?: string }[] = [];

  await Promise.all(
    ((projects ?? []) as Project[]).map(async (project) => {
      const entry: (typeof plan)[number] = { project: project.domain, due: 0 };
      plan.push(entry);
      try {
        const keywords = await fetchAll<DueKeyword>((from, to) =>
          supabase
            .from("keywords")
            .select("id, keyword, locale, country, best_position, priority, status, last_checked_at, content_updated_at")
            .eq("project_id", project.id)
            .neq("status", "ignored")
            .order("id")
            .range(from, to),
        );
        const due = pickDue(keywords, { freshOnly });
        entry.due = due.length;
        if (dry || !due.length) return;

        // Ngân sách riêng của dự án (nếu có)
        const ps = await getProjectSpend(supabase, project.id);
        let projectAllowance =
          ps?.budget != null ? Math.floor((ps.budget - ps.spent) / AUTO_SCHEDULE.maxCostPerKeyword) : Infinity;

        const { result, costUsd } = await metered(
          { supabase, userId: null, projectId: project.id, feature: "rankings", providers: ["brightdata"] },
          () =>
            checkKeywordRanks(supabase, project, due, {
              concurrency: 2,
              deadline,
              limiter,
              canStart: () => {
                if (allowance <= 0 || projectAllowance <= 0) return false;
                allowance--;
                projectAllowance--;
                return true;
              },
            }),
        );
        entry.checked = result.checked;
        totals.checked += result.checked;
        totals.found += result.found;
        totals.skipped += result.skipped;
        totals.remaining += result.remaining;
        totals.cost_usd += costUsd;
      } catch (err) {
        entry.note = err instanceof BudgetExceededError ? "project_budget_exceeded" : err instanceof Error ? err.message : String(err);
        totals.remaining += entry.due;
      }
    }),
  );

  return finish(supabase, dry, { ...totals, note: freshOnly ? "budget_warning_fresh_only" : null }, plan);
}

async function finish(
  supabase: ReturnType<typeof createAdminClient>,
  dry: boolean,
  run: Partial<{ checked: number; found: number; skipped: number; remaining: number; cost_usd: number; note: string | null }>,
  plan: { project: string; due: number; checked?: number; note?: string }[] = [],
) {
  if (!dry) {
    const { error } = await supabase
      .from("cron_runs")
      .insert({ job: "rankings", finished_at: new Date().toISOString(), ...run });
    if (error) console.error("cron_runs insert failed:", error.message);
  }
  return NextResponse.json({ ok: true, dry, ...run, plan });
}
