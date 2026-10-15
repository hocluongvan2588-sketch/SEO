"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scanSiteContent } from "@/lib/ai";
import { fail, type ActionResult } from "@/lib/context";
import { crawlSite, verifyQuote } from "@/lib/site-scan";
import { staffLocale } from "@/lib/staff-locale";
import { getSession } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { metered } from "@/lib/usage";
import { hostOf, normalizeUrl } from "@/lib/utils";

/** Một dữ kiện lấy từ website, kèm kết quả đối chiếu trích dẫn */
export interface Cited {
  evidence: string;
  /** Trang thật sự chứa trích dẫn; null = KHÔNG tìm thấy trên website (AI có thể đã bịa) */
  verified_url: string | null;
}
export interface ScanProduct extends Cited {
  name: string;
  category: string;
  details: string;
}
export interface ScanSeed {
  country: string;
  locale: string;
  keyword: string;
  product: string;
  reason: string;
}
export interface ScanOutcome {
  business_type: string;
  products: ScanProduct[];
  certifications: (Cited & { name: string })[];
  services: (Cited & { name: string })[];
  seeds: ScanSeed[];
  observations: string[];
  /** Số mục AI đưa ra nhưng bị loại vì không đối chiếu được */
  rejected: { products: number; certifications: number; services: number; seeds: number };
}
export interface ScanRecord {
  id: string;
  url: string;
  created_at: string;
  pages: { url: string; title: string; chars: number }[];
  facts: { homeLang: string | null; hreflang: string[]; pagesRead: number };
  result: ScanOutcome;
}

const ScanInput = z.object({
  projectId: z.string().uuid(),
  url: z.string().min(3),
  markets: z.array(z.string().length(2)).min(1).max(6),
});

/**
 * Đọc website khách → AI liệt kê sản phẩm/chứng nhận/dịch vụ (bắt buộc trích nguyên văn) →
 * hệ thống đối chiếu từng trích dẫn với nội dung trang thật. Mục không đối chiếu được bị đánh dấu,
 * không cho lưu vào danh mục. Từ khóa gốc chỉ giữ lại nếu nhắm vào sản phẩm đã xác minh.
 */
export async function scanWebsite(input: z.input<typeof ScanInput>): Promise<ActionResult<{ scan: ScanRecord; costUsd: number }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const v = ScanInput.parse(input);
    const { data: project, error: pErr } = await session.supabase.from("projects").select("*").eq("id", v.projectId).single();
    if (pErr) throw pErr;
    const lang = await staffLocale();

    const { result, costUsd } = await metered(
      { supabase: session.supabase, userId: session.user.id, projectId: v.projectId, feature: "scan", providers: ["brightdata", "claude"] },
      async () => {
        const { pages, facts } = await crawlSite(normalizeUrl(v.url));
        if (!pages.some((p) => p.text.length > 200)) throw new Error("Không đọc được nội dung website (trang trống hoặc bị chặn)");
        const ai = await scanSiteContent({
          project: project as Project,
          ownSite: hostOf(v.url) === hostOf((project as Project).domain) || hostOf(v.url).endsWith(`.${hostOf((project as Project).domain)}`),
          pages,
          facts,
          markets: v.markets,
          staffLocale: lang,
        });
        return { pages, facts, ai };
      },
    );
    const { pages, facts, ai } = result;

    // Trích dẫn phải có thật trên trang VÀ tên phải xuất hiện trên chính trang đó
    // (chứng nhận: khớp nguyên văn; sản phẩm: ≥ 80% từ và mọi con số/mã quy cách)
    const check = <T extends { name: string; evidence: string; source_url: string }>(items: T[], strict: boolean) =>
      items.map(({ source_url, ...rest }) => ({
        ...rest,
        verified_url: verifyQuote(rest.evidence, source_url, pages, { value: rest.name, strict }),
      }));

    const products = check(ai.products, false);
    const certifications = check(ai.certifications, true);
    const services = check(ai.services, false);
    const okNames = new Set(products.filter((p) => p.verified_url).map((p) => p.name.trim().toLowerCase()));
    const markets = new Set(v.markets.map((m) => m.toLowerCase()));
    const seeds = ai.seeds
      .map((s) => ({ ...s, country: s.country.toLowerCase() }))
      .filter((s) => markets.has(s.country) && (s.product === "*" || okNames.has(s.product.trim().toLowerCase())));

    const outcome: ScanOutcome = {
      business_type: ai.business_type,
      products,
      certifications,
      services,
      seeds,
      observations: ai.observations,
      rejected: {
        products: products.filter((p) => !p.verified_url).length,
        certifications: certifications.filter((c) => !c.verified_url).length,
        services: services.filter((c) => !c.verified_url).length,
        seeds: ai.seeds.length - seeds.length,
      },
    };

    const { data: row, error } = await session.supabase
      .from("site_scans")
      .insert({
        project_id: v.projectId,
        url: normalizeUrl(v.url),
        pages: pages.map((p) => ({ url: p.url, title: p.title, chars: p.text.length })),
        facts,
        result: outcome,
        created_by: session.user.id,
      })
      .select("id, url, created_at, pages, facts, result")
      .single();
    if (error) throw error;
    revalidatePath("/products");
    return { ok: true, data: { scan: row as ScanRecord, costUsd } };
  } catch (e) {
    return fail(e);
  }
}

/** Lưu các sản phẩm đã xác minh (nhân viên chọn) vào danh mục, gắn kèm các chứng nhận đã xác minh được chọn. */
export async function saveScannedProducts(input: {
  scanId: string;
  productIndexes: number[];
  certificationIndexes: number[];
}): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { data: scan, error } = await session.supabase
      .from("site_scans")
      .select("project_id, url, result, projects(domain)")
      .eq("id", input.scanId)
      .single();
    if (error) throw error;
    // Chặn lưu nhầm: website đã quét phải là website của dự án
    const projectHost = hostOf((scan.projects as unknown as { domain: string } | null)?.domain ?? "");
    const scanHost = hostOf(scan.url);
    if (!projectHost || (scanHost !== projectHost && !scanHost.endsWith(`.${projectHost}`)))
      throw new Error(`Website ${scanHost} không thuộc dự án này (${projectHost}). Hãy tạo dự án riêng cho khách rồi quét lại.`);
    const result = scan.result as ScanOutcome;
    const certs = input.certificationIndexes
      .map((i) => result.certifications[i])
      .filter((c) => c?.verified_url)
      .map((c) => c.name);
    // Chỉ sản phẩm đã đối chiếu được trích dẫn mới được lưu (chặn ở server, không chỉ ở giao diện)
    const rows = input.productIndexes
      .map((i) => result.products[i])
      .filter((p): p is ScanProduct => !!p?.verified_url)
      .map((p) => ({
        project_id: scan.project_id,
        name: p.name,
        category: p.category || null,
        details: p.details || null,
        certifications: certs,
        source: "website" as const,
        source_url: p.verified_url,
        evidence: p.evidence,
        created_by: session.user.id,
      }));
    if (!rows.length) throw new Error("Chưa chọn sản phẩm đã xác minh nào");
    const { error: insErr } = await session.supabase.from("project_products").insert(rows);
    if (insErr) throw insErr;
    revalidatePath("/products");
    return { ok: true, data: { count: rows.length } };
  } catch (e) {
    return fail(e);
  }
}

const ProductInput = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).optional(),
  details: z.string().trim().max(2000).optional(),
  certifications: z.array(z.string().trim().min(1)).max(20).default([]),
});

export async function saveProduct(projectId: string, input: z.input<typeof ProductInput>, id?: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const v = ProductInput.parse(input);
    const row = { name: v.name, category: v.category || null, details: v.details || null, certifications: v.certifications };
    const { error } = id
      ? await session.supabase.from("project_products").update(row).eq("id", id)
      : await session.supabase
          .from("project_products")
          .insert({ ...row, project_id: projectId, source: "manual", created_by: session.user.id });
    if (error) throw error;
    revalidatePath("/products");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("project_products").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/products");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
