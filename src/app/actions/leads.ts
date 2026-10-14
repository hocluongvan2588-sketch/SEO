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
import { countryName } from "@/lib/locales";
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

/** Câu truy vấn Google tìm hồ sơ LinkedIn công khai theo sản phẩm + chức danh + thị trường */
function buildQuery(product: string, roles: string[], country: string, extra: string) {
  const roleExpr = roles.length ? `(${roles.map((r) => `"${r}"`).join(" OR ")})` : "";
  return ["site:linkedin.com/in", roleExpr, product.trim() && `"${product.trim()}"`, extra.trim(), `"${countryName(country, "en")}"`]
    .filter(Boolean)
    .join(" ");
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
    const query = buildQuery(input.product, input.roles, input.country, input.extra);
    const { result: candidates, costUsd } = await metered(
      { supabase: session.supabase, userId: session.user.id, projectId: project.id, feature: "leads", providers: ["brightdata"] },
      () => findLinkedInProfiles(query, { gl: input.country, pages: 2 }),
    );
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
}): Promise<ActionResult<{ saved: number; failed: number; costUsd: number }>> {
  try {
    const { session, project } = await loadProject(input.projectId);
    const urls = Array.from(new Set(input.urls.map(normalizeLinkedInUrl).filter((u): u is string => Boolean(u)))).slice(0, 20);
    if (!urls.length) throw new Error("Không có link hồ sơ LinkedIn hợp lệ (dạng linkedin.com/in/...)");
    const lang = await staffLocale();

    const { result, costUsd } = await metered(
      {
        supabase: session.supabase,
        userId: session.user.id,
        projectId: project.id,
        feature: "leads",
        providers: input.withAi ? ["brightdata", "claude"] : ["brightdata"],
      },
      async () => {
        const profiles = (await scrapeLinkedInProfiles(urls)).filter((p) => !p.error && p.name);
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
