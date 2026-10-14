"use server";

import { revalidatePath } from "next/cache";
import { qualifyLeads } from "@/lib/ai";
import {
  findLinkedInProfiles,
  normalizeLinkedInUrl,
  scrapeLinkedInProfiles,
  type LinkedInCandidate,
} from "@/lib/brightdata";
import { fail, type ActionResult } from "@/lib/context";
import { staffLocale } from "@/lib/staff-locale";
import { getSession } from "@/lib/supabase/server";
import type { Lead, LeadStatus, Project } from "@/lib/types";
import { metered } from "@/lib/usage";

async function loadProject(projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const { data, error } = await session.supabase.from("projects").select("*").eq("id", projectId).single();
  if (error) throw error;
  return { session, project: data as Project };
}

/**
 * Các câu truy vấn Google từ chặt đến rộng. Buyer hiếm khi ghi đúng tên sản phẩm trên hồ sơ
 * (họ ghi "nuts", "food importer"…), nên nới dần:
 *  1. đúng cụm sản phẩm  2. các từ của sản phẩm  3. theo nhóm ngành (importer / distributor / wholesale)
 * Thị trường lọc qua Google của nước đó (gl), không đưa tên nước vào câu vì hồ sơ thường chỉ ghi thành phố.
 */
function buildQueries(product: string, roles: string[], extra: string) {
  const roleExpr = roles.length ? `(${roles.map((r) => `"${r}"`).join(" OR ")})` : "";
  const p = product.trim().replace(/"/g, "");
  const ex = extra.trim();
  const join = (...parts: string[]) => ["site:linkedin.com/in", roleExpr, ...parts].filter(Boolean).join(" ");
  return Array.from(
    new Set([
      join(`"${p}"`, ex),
      join(p, ex),
      join(ex || "food", "(importer OR import OR distributor OR distribution OR wholesale)"),
    ]),
  );
}

export interface BuyerSearchResult {
  query: string;
  candidates: (LinkedInCandidate & { saved: boolean })[];
  costUsd: number;
}

export async function searchBuyers(input: {
  projectId: string;
  product: string;
  country: string;
  roles: string[];
  extra: string;
}): Promise<ActionResult<BuyerSearchResult>> {
  try {
    const { session, project } = await loadProject(input.projectId);
    if (!input.product.trim()) throw new Error("Product is required");
    const {
      result: { candidates, queriesUsed },
      costUsd,
    } = await metered(
      { supabase: session.supabase, userId: session.user.id, projectId: project.id, feature: "leads", providers: ["brightdata"] },
      () => findLinkedInProfiles(buildQueries(input.product, input.roles, input.extra), { gl: input.country, target: 20 }),
    );
    const query = queriesUsed.join("\n");
    const { data: existing } = await session.supabase
      .from("leads")
      .select("linkedin_url")
      .eq("project_id", project.id)
      .in("linkedin_url", candidates.map((c) => c.url).concat("-"));
    const saved = new Set((existing ?? []).map((e) => e.linkedin_url));
    return { ok: true, data: { query, candidates: candidates.map((c) => ({ ...c, saved: saved.has(c.url) })), costUsd } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Lấy hồ sơ (tối đa 20 URL/lần) → lưu vào danh sách → tùy chọn để AI chấm điểm và soạn lời chào.
 */
export async function collectLeads(input: {
  projectId: string;
  urls: string[];
  product: string;
  source: "search" | "manual";
  searchQuery?: string;
  withAi: boolean;
  messageLanguage: string;
  /** Dòng tiêu đề từ kết quả Google ("Chức danh · Công ty") theo URL — bù khi Bright Data thiếu */
  hints?: Record<string, string>;
}): Promise<ActionResult<{ saved: number; failed: number; costUsd: number }>> {
  try {
    const { session, project } = await loadProject(input.projectId);
    const urls = Array.from(new Set(input.urls.map(normalizeLinkedInUrl).filter((u): u is string => Boolean(u)))).slice(0, 20);
    if (!urls.length) throw new Error("Không có link hồ sơ LinkedIn hợp lệ (dạng linkedin.com/in/...)");
    const lang = await staffLocale();
    const hints = new Map(
      Object.entries(input.hints ?? {})
        .map(([u, h]) => [normalizeLinkedInUrl(u), h.split(" · ").map((x) => x.trim()).filter(Boolean)] as const)
        .filter((e): e is [string, string[]] => Boolean(e[0]) && e[1].length > 0),
    );

    const { result, costUsd } = await metered(
      {
        supabase: session.supabase,
        userId: session.user.id,
        projectId: project.id,
        feature: "leads",
        providers: input.withAi ? ["brightdata", "claude"] : ["brightdata"],
      },
      async () => {
        const profiles = (await scrapeLinkedInProfiles(urls))
          .filter((p) => !p.error && p.name)
          .map((p) => {
            const h = hints.get(p.url);
            if (!h) return p;
            return {
              ...p,
              headline: p.headline ?? h[0] ?? null,
              company: p.company ?? (h.length > 1 ? h[h.length - 1] : null),
            };
          });
        const ai =
          input.withAi && profiles.length
            ? await qualifyLeads({ project, product: input.product, leads: profiles, staffLocale: lang, messageLanguage: input.messageLanguage })
            : [];
        return { profiles, ai };
      },
    );

    const now = new Date().toISOString();
    // Thời hạn lưu trữ tính lại từ lần thu thập gần nhất
    const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const rows = result.profiles.map((p, i) => {
      const a = result.ai.find((x) => x.index === i);
      return {
        project_id: project.id,
        linkedin_url: p.url,
        name: p.name,
        headline: p.headline,
        company: p.company,
        company_url: p.companyUrl,
        location: p.location,
        country_code: p.countryCode,
        about: p.about,
        experience: p.experience,
        avatar_url: p.avatarUrl,
        product: input.product || null,
        source: input.source,
        search_query: input.searchQuery ?? null,
        collected_at: now,
        expires_at: expires,
        created_by: session.user.id,
        ...(a ? { ai_score: a.score, ai_reason: a.reason, ai_message: a.message } : {}),
      };
    });
    if (rows.length) {
      // Lấy lại hồ sơ đã có: cập nhật dữ liệu, giữ trạng thái / ghi chú / người phụ trách
      const { error } = await session.supabase.from("leads").upsert(rows, { onConflict: "project_id,linkedin_url" });
      if (error) throw error;
    }
    revalidatePath("/leads");
    return { ok: true, data: { saved: rows.length, failed: urls.length - rows.length, costUsd } };
  } catch (e) {
    return fail(e);
  }
}

/** AI chấm điểm lại + soạn lại lời chào cho các buyer đã lưu */
export async function requalifyLeads(input: {
  projectId: string;
  ids: string[];
  product: string;
  messageLanguage: string;
}): Promise<ActionResult<{ updated: number; costUsd: number }>> {
  try {
    const { session, project } = await loadProject(input.projectId);
    const { data, error } = await session.supabase.from("leads").select("*").in("id", input.ids.slice(0, 20));
    if (error) throw error;
    const leads = (data ?? []) as Lead[];
    if (!leads.length) throw new Error("No leads selected");
    const lang = await staffLocale();
    const { result, costUsd } = await metered(
      { supabase: session.supabase, userId: session.user.id, projectId: project.id, feature: "leads", providers: ["claude"] },
      () =>
        qualifyLeads({
          project,
          product: input.product || leads[0].product || project.industry || "",
          leads,
          staffLocale: lang,
          messageLanguage: input.messageLanguage,
        }),
    );
    await Promise.all(
      result
        .filter((a) => leads[a.index])
        .map((a) =>
          session.supabase
            .from("leads")
            .update({ ai_score: a.score, ai_reason: a.reason, ai_message: a.message, ...(input.product ? { product: input.product } : {}) })
            .eq("id", leads[a.index].id),
        ),
    );
    revalidatePath("/leads");
    return { ok: true, data: { updated: result.length, costUsd } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateLead(
  id: string,
  patch: Partial<{ status: LeadStatus; owner_id: string | null; notes: string | null; ai_message: string | null }>,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("leads").update(patch).eq("id", id);
    if (error) throw error;
    revalidatePath("/leads");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkUpdateLeads(ids: string[], patch: { status?: LeadStatus; owner_id?: string | null }): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("leads").update(patch).in("id", ids);
    if (error) throw error;
    revalidatePath("/leads");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

/** Xóa hẳn (kể cả khi người được liên hệ yêu cầu xóa dữ liệu) */
export async function deleteLeads(ids: string[]): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("leads").delete().in("id", ids);
    if (error) throw error;
    revalidatePath("/leads");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
