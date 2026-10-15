"use server";

import { revalidatePath } from "next/cache";
import { analyzeKeywords, clusterKeywords, type KeywordAnalysis } from "@/lib/ai";
import { googleSearch, type SerpResult } from "@/lib/brightdata";
import { fail, type ActionResult } from "@/lib/context";
import { applyKeywordFilters, type KeywordFilters } from "@/lib/keyword-filters";
import { fetchAll } from "@/lib/paging";
import { checkKeywordRanks } from "@/lib/rank-check";
import { metered } from "@/lib/usage";
import { staffLocale } from "@/lib/staff-locale";
import { getSession } from "@/lib/supabase/server";
import type { Keyword, KeywordStatus, Priority, Project } from "@/lib/types";

async function loadProject(projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const { data, error } = await session.supabase.from("projects").select("*").eq("id", projectId).single();
  if (error) throw error;
  return { session, project: data as Project };
}

export interface ResearchResult {
  researchId: string;
  serp: SerpResult;
  ai: KeywordAnalysis;
  /** Chi phí ước tính của lần chạy này (USD) */
  costUsd?: number;
}

/** Lấy SERP thật qua Bright Data → Claude phân tích → lưu lịch sử nghiên cứu. */
export async function runKeywordResearch(input: {
  projectId: string;
  seed: string;
  locale: string;
  country: string;
}): Promise<ActionResult<ResearchResult>> {
  try {
    const { session, project } = await loadProject(input.projectId);
    const seed = input.seed.trim();
    if (!seed) throw new Error("Seed keyword is required");
    const lang = await staffLocale();
    const {
      result: { serp, ai },
      costUsd,
    } = await metered(
      { supabase: session.supabase, userId: session.user.id, projectId: project.id, feature: "research", providers: ["brightdata", "claude"] },
      async () => {
        const [serp, { data: products }] = await Promise.all([
          googleSearch(seed, { hl: input.locale, gl: input.country }),
          session.supabase.from("project_products").select("name, details, certifications").eq("project_id", project.id).limit(30),
        ]);
        const ai = await analyzeKeywords({
          project,
          seed,
          locale: input.locale,
          country: input.country,
          serp,
          staffLocale: lang,
          products: products ?? undefined,
        });
        return { serp, ai };
      },
    );
    const { data, error } = await session.supabase
      .from("keyword_research")
      .insert({
        project_id: project.id,
        seed,
        locale: input.locale,
        country: input.country,
        serp,
        ai,
        created_by: session.user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, data: { researchId: data.id, serp, ai, costUsd } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveKeywords(input: {
  projectId: string;
  researchId: string | null;
  locale: string;
  country: string;
  keywords: KeywordAnalysis["keywords"];
}): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const rows = input.keywords.map((k) => ({
      project_id: input.projectId,
      research_id: input.researchId,
      keyword: k.keyword.trim().toLowerCase(),
      locale: input.locale,
      country: input.country,
      intent: k.intent,
      difficulty: k.difficulty,
      priority: k.priority,
      cluster: k.cluster,
      content_type: k.content_type,
      notes: k.rationale,
    }));
    const { error } = await session.supabase
      .from("keywords")
      .upsert(rows, { onConflict: "project_id,keyword,locale,country", ignoreDuplicates: true });
    if (error) throw error;
    revalidatePath("/keywords");
    return { ok: true, data: { count: rows.length } };
  } catch (e) {
    return fail(e);
  }
}

export async function addKeywordsManually(input: {
  projectId: string;
  locale: string;
  country: string;
  keywords: string[];
}): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const rows = Array.from(new Set(input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))).map((keyword) => ({
      project_id: input.projectId,
      keyword,
      locale: input.locale,
      country: input.country,
    }));
    const { error } = await session.supabase
      .from("keywords")
      .upsert(rows, { onConflict: "project_id,keyword,locale,country", ignoreDuplicates: true });
    if (error) throw error;
    revalidatePath("/keywords");
    return { ok: true, data: { count: rows.length } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateKeyword(
  id: string,
  patch: Partial<{ status: KeywordStatus; priority: Priority; target_url: string | null; cluster: string | null; notes: string | null }>,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("keywords").update(patch).eq("id", id);
    if (error) throw error;
    revalidatePath("/keywords");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkUpdateKeywords(ids: string[], patch: { status?: KeywordStatus; priority?: Priority }): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("keywords").update(patch).in("id", ids);
    if (error) throw error;
    revalidatePath("/keywords");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteKeywords(ids: string[]): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("keywords").delete().in("id", ids);
    if (error) throw error;
    revalidatePath("/keywords");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

/** Đánh dấu trang của từ khóa vừa được cập nhật nội dung → tự động kiểm tra dày hơn trong 30 ngày. */
export async function markContentUpdated(ids: string[]): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase
      .from("keywords")
      .update({ content_updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw error;
    revalidatePath("/keywords");
    revalidatePath("/rankings");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

/** Toàn bộ từ khóa khớp bộ lọc (để xuất CSV) — đọc theo từng khối 1.000 dòng. */
export async function exportKeywords(projectId: string, filters: KeywordFilters): Promise<ActionResult<Keyword[]>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const rows = await fetchAll<Keyword>((from, to) =>
      applyKeywordFilters(session.supabase.from("keywords").select("*").eq("project_id", projectId), filters)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    return { ok: true, data: rows };
  } catch (e) {
    return fail(e);
  }
}

/** Id của mọi từ khóa đang theo dõi (trừ Bỏ qua) — cho nút "Kiểm tra tất cả". */
export async function listTrackableKeywordIds(projectId: string): Promise<ActionResult<string[]>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const rows = await fetchAll<{ id: string }>((from, to) =>
      session.supabase
        .from("keywords")
        .select("id")
        .eq("project_id", projectId)
        .neq("status", "ignored")
        .order("current_position", { ascending: true, nullsFirst: false })
        .order("id")
        .range(from, to),
    );
    return { ok: true, data: rows.map((r) => r.id) };
  } catch (e) {
    return fail(e);
  }
}

/** Claude gom cụm toàn bộ từ khóa (hoặc từ khóa được chọn) của dự án. */
export async function clusterProjectKeywords(projectId: string, ids?: string[]): Promise<ActionResult<{ clusters: number }>> {
  try {
    const { session, project } = await loadProject(projectId);
    let q = session.supabase.from("keywords").select("id, keyword").eq("project_id", projectId);
    if (ids?.length) q = q.in("id", ids);
    const { data: rows, error } = await q.limit(400);
    if (error) throw error;
    if (!rows?.length) throw new Error("No keywords to cluster");
    const lang = await staffLocale();
    const { result } = await metered(
      { supabase: session.supabase, userId: session.user.id, projectId, feature: "cluster", providers: ["claude"] },
      () => clusterKeywords({ project, keywords: rows.map((r) => r.keyword), staffLocale: lang }),
    );
    const byKeyword = new Map(rows.map((r) => [r.keyword.toLowerCase(), r.id]));
    await Promise.all(
      result.clusters.flatMap((c) =>
        c.keywords
          .map((k) => byKeyword.get(k.trim().toLowerCase()))
          .filter((id): id is string => Boolean(id))
          .map((id) => session.supabase.from("keywords").update({ cluster: c.name }).eq("id", id)),
      ),
    );
    revalidatePath("/keywords");
    return { ok: true, data: { clusters: result.clusters.length } };
  } catch (e) {
    return fail(e);
  }
}

/** Kiểm tra thứ hạng Google (top 30) cho các từ khóa được chọn. */
export async function checkRankings(
  projectId: string,
  ids: string[],
): Promise<ActionResult<{ checked: number; found: number; skipped: number; costUsd: number }>> {
  try {
    const { session, project } = await loadProject(projectId);
    const { data: rows, error } = await session.supabase
      .from("keywords")
      .select("id, keyword, locale, country, best_position")
      .in("id", ids.slice(0, 25));
    if (error) throw error;
    const {
      result: { found, skipped, lastError },
      costUsd,
    } = await metered(
      { supabase: session.supabase, userId: session.user.id, projectId, feature: "rankings", providers: ["brightdata"] },
      // Một từ khóa lỗi (vd. Bright Data tạm khóa câu đó) không làm hỏng cả lượt — bỏ qua, giữ thứ hạng cũ
      () => checkKeywordRanks(session.supabase, project, rows ?? []),
    );
    const total = rows?.length ?? 0;
    if (total > 0 && skipped === total) throw new Error(lastError);
    revalidatePath("/keywords");
    revalidatePath("/rankings");
    return { ok: true, data: { checked: total - skipped, found, skipped, costUsd } };
  } catch (e) {
    return fail(e);
  }
}

export async function getResearch(id: string): Promise<ActionResult<ResearchResult & { seed: string; locale: string; country: string }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { data, error } = await session.supabase.from("keyword_research").select("*").eq("id", id).single();
    if (error) throw error;
    return {
      ok: true,
      data: { researchId: data.id, serp: data.serp, ai: data.ai, seed: data.seed, locale: data.locale, country: data.country },
    };
  } catch (e) {
    return fail(e);
  }
}
