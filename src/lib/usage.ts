import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Giá Claude API, USD / 1 triệu token (bảng giá công bố 2026-10). */
const CLAUDE_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
/** Model lạ → tính theo giá Opus 5.5 để không ước tính thấp hơn thực tế */
const FALLBACK_PRICE = CLAUDE_PRICES["claude-opus-5-5"];

/** Bright Data SERP API / Web Unlocker: USD cho mỗi request thành công */
export const BRIGHTDATA_PRICE_PER_REQUEST = 1.5 / 1000;

export function claudeCost(model: string, u: { input: number; output: number; cacheRead: number }) {
  const key = Object.keys(CLAUDE_PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  const p = key ? CLAUDE_PRICES[key] : FALLBACK_PRICE;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead) / 1_000_000;
}

interface ClaudeEntry {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
}

interface Meter {
  claude: ClaudeEntry[];
  brightdataRequests: number;
}

const storage = new AsyncLocalStorage<Meter>();

/** Gọi từ lib/ai.ts sau mỗi response của Claude */
export function recordClaude(entry: ClaudeEntry) {
  storage.getStore()?.claude.push(entry);
}

/** Gọi từ lib/brightdata.ts sau mỗi request thành công (chỉ request thành công bị tính phí) */
export function recordBrightData(requests = 1) {
  const m = storage.getStore();
  if (m) m.brightdataRequests += requests;
}

export class BudgetExceededError extends Error {
  constructor(public provider: "claude" | "brightdata" | "project") {
    super(
      provider === "claude"
        ? "Đã hết ngân sách Claude API của tháng này. Quản trị có thể nâng hạn mức ở trang Chi phí."
        : provider === "brightdata"
          ? "Đã hết ngân sách Bright Data của tháng này. Quản trị có thể nâng hạn mức ở trang Chi phí."
          : "Dự án này đã dùng hết ngân sách riêng của tháng. Quản trị có thể nâng hạn mức ở trang Chi phí → Theo dự án.",
    );
  }
}

/** Chi phí tháng này + ngân sách riêng của dự án (budget null = không giới hạn riêng). */
export async function getProjectSpend(supabase: SupabaseClient, projectId: string) {
  const { data, error } = await supabase.rpc("project_month_spend", { p_project: projectId });
  if (error || !data?.[0]) return null; // migration 0007 chưa chạy → không chặn
  return {
    spent: Number(data[0].spent_usd),
    budget: data[0].budget_usd == null ? null : Number(data[0].budget_usd),
  };
}

export interface MonthSpend {
  claude_usd: number;
  brightdata_usd: number;
  claude_budget_usd: number;
  brightdata_budget_usd: number;
}

export async function getMonthSpend(supabase: SupabaseClient): Promise<MonthSpend | null> {
  const { data, error } = await supabase.rpc("month_spend");
  if (error || !data?.[0]) return null; // migration 0004 chưa chạy → không chặn gì
  const r = data[0];
  return {
    claude_usd: Number(r.claude_usd),
    brightdata_usd: Number(r.brightdata_usd),
    claude_budget_usd: Number(r.claude_budget_usd),
    brightdata_budget_usd: Number(r.brightdata_budget_usd),
  };
}

export interface MeteredContext {
  supabase: SupabaseClient;
  /** null = chạy tự động (cron) */
  userId: string | null;
  projectId?: string | null;
  feature: "research" | "cluster" | "rankings" | "audit" | "schema" | "leads";
  /** Dịch vụ thao tác này sẽ dùng — chặn trước nếu đã hết ngân sách */
  providers: ("claude" | "brightdata")[];
}

/**
 * Chạy một thao tác tốn phí: kiểm tra ngân sách, đếm mọi lần gọi Claude / Bright Data
 * bên trong `fn`, rồi ghi vào bảng usage_events — kể cả khi `fn` lỗi giữa chừng
 * (request Bright Data đã thành công vẫn bị tính phí).
 */
export async function metered<T>(ctx: MeteredContext, fn: () => Promise<T>): Promise<{ result: T; costUsd: number }> {
  const spend = await getMonthSpend(ctx.supabase);
  if (spend) {
    if (ctx.providers.includes("claude") && spend.claude_usd >= spend.claude_budget_usd) throw new BudgetExceededError("claude");
    if (ctx.providers.includes("brightdata") && spend.brightdata_usd >= spend.brightdata_budget_usd)
      throw new BudgetExceededError("brightdata");
  }
  if (ctx.projectId) {
    const p = await getProjectSpend(ctx.supabase, ctx.projectId);
    if (p?.budget != null && p.spent >= p.budget) throw new BudgetExceededError("project");
  }

  const meter: Meter = { claude: [], brightdataRequests: 0 };
  let result: T | undefined;
  let failure: unknown;
  try {
    result = await storage.run(meter, fn);
  } catch (err) {
    failure = err;
  }
  const costUsd = await flush(ctx, meter);
  if (failure !== undefined) throw failure;
  return { result: result as T, costUsd };
}

async function flush(ctx: MeteredContext, meter: Meter) {
  const rows: Record<string, unknown>[] = [];
  const base = { user_id: ctx.userId, project_id: ctx.projectId ?? null, feature: ctx.feature };

  // Gom theo model (fallback có thể chuyển sang model khác)
  const byModel = new Map<string, ClaudeEntry>();
  for (const e of meter.claude) {
    const acc = byModel.get(e.model) ?? { model: e.model, input: 0, output: 0, cacheRead: 0 };
    acc.input += e.input;
    acc.output += e.output;
    acc.cacheRead += e.cacheRead;
    byModel.set(e.model, acc);
  }
  for (const e of byModel.values()) {
    rows.push({
      ...base,
      provider: "claude",
      model: e.model,
      input_tokens: e.input,
      output_tokens: e.output,
      cache_read_tokens: e.cacheRead,
      requests: meter.claude.filter((c) => c.model === e.model).length,
      cost_usd: claudeCost(e.model, e),
    });
  }
  if (meter.brightdataRequests > 0) {
    rows.push({
      ...base,
      provider: "brightdata",
      requests: meter.brightdataRequests,
      cost_usd: meter.brightdataRequests * BRIGHTDATA_PRICE_PER_REQUEST,
    });
  }
  if (!rows.length) return 0;
  const { error } = await ctx.supabase.from("usage_events").insert(rows);
  if (error) console.error("usage_events insert failed:", error.message); // không làm hỏng thao tác chính
  return rows.reduce((s, r) => s + Number(r.cost_usd), 0);
}
