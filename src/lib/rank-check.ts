import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findRank } from "./brightdata";

export interface RankRow {
  id: string;
  keyword: string;
  locale: string;
  country: string | null;
  best_position: number | null;
}

/**
 * Kiểm tra thứ hạng cho danh sách từ khóa (chạy song song `concurrency` từ khóa),
 * lưu lịch sử + cập nhật vị trí. Từ khóa lỗi bị bỏ qua, giữ thứ hạng cũ.
 * Dừng nhận từ khóa mới khi quá `deadline` (ms epoch) để không vượt giới hạn thời gian.
 */
export async function checkKeywordRanks(
  supabase: SupabaseClient,
  project: { domain: string; country: string },
  rows: RankRow[],
  opts: { concurrency?: number; deadline?: number } = {},
) {
  let found = 0;
  let skipped = 0;
  let checked = 0;
  let lastError = "";
  const queue = [...rows];

  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      if (opts.deadline && Date.now() > opts.deadline) {
        queue.unshift(row);
        return;
      }
      let rank: { position: number | null; url: string | null };
      try {
        rank = await findRank(row.keyword, project.domain, { hl: row.locale, gl: row.country || project.country });
      } catch (err) {
        skipped++;
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
      const { position, url } = rank;
      checked++;
      if (position) found++;
      const now = new Date().toISOString();
      await supabase.from("rank_checks").insert({ keyword_id: row.id, position, url, checked_at: now });
      await supabase
        .from("keywords")
        .update({
          current_position: position,
          best_position: position && (!row.best_position || position < row.best_position) ? position : row.best_position,
          target_url: url ?? undefined,
          last_checked_at: now,
        })
        .eq("id", row.id);
    }
  }

  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, rows.length) }, worker));
  return { checked, found, skipped, lastError, remaining: queue.length };
}

/** Lịch tự động (giờ server, mỗi lần cron chạy) */
export const AUTO_SCHEDULE = {
  /** Từ khóa thường: kiểm tra lại khi đã quá 6 ngày → mỗi tuần 1 lần */
  weeklyAfterHours: 6 * 24,
  /** Bài vừa đăng/cập nhật trong 30 ngày: quá 36 giờ → khoảng 3 lần/tuần (T2, T4, T6) */
  freshDays: 30,
  freshAfterHours: 36,
  /** Chi phí tối đa một từ khóa (3 trang Google) — dùng để không vượt ngân sách */
  maxCostPerKeyword: 0.0045,
};

export interface DueKeyword extends RankRow {
  priority: string | null;
  status: string;
  last_checked_at: string | null;
  content_updated_at: string | null;
}

/** Từ khóa vừa đăng/cập nhật nội dung trong 30 ngày qua */
export function isFresh(k: Pick<DueKeyword, "status" | "content_updated_at">, now = Date.now()) {
  return (
    k.status === "published" &&
    !!k.content_updated_at &&
    now - new Date(k.content_updated_at).getTime() < AUTO_SCHEDULE.freshDays * 864e5
  );
}

/** Lọc từ khóa đến hạn kiểm tra và sắp xếp: bài mới → ưu tiên Cao → chưa kiểm tra → lâu chưa kiểm tra nhất. */
export function pickDue(keywords: DueKeyword[], opts: { freshOnly?: boolean; now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const age = (k: DueKeyword) => (k.last_checked_at ? (now - new Date(k.last_checked_at).getTime()) / 36e5 : Infinity);
  return keywords
    .filter((k) => k.status !== "ignored")
    .map((k) => ({ k, fresh: isFresh(k, now), age: age(k) }))
    .filter(({ fresh, age }) =>
      fresh ? age >= AUTO_SCHEDULE.freshAfterHours : !opts.freshOnly && age >= AUTO_SCHEDULE.weeklyAfterHours,
    )
    .sort(
      (a, b) =>
        Number(b.fresh) - Number(a.fresh) ||
        Number(b.k.priority === "high") - Number(a.k.priority === "high") ||
        b.age - a.age,
    )
    .map(({ k }) => k);
}
