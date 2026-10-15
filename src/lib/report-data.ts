import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SerpResult } from "./brightdata";
import type { Audit, Project } from "./types";
import { hostOf } from "./utils";

export const REPORT_SECTIONS = ["health", "international", "keywords", "competitors", "rankings", "roadmap"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export interface ReportData {
  project: { name: string; domain: string; industry: string | null; markets: string[]; locales: string[] };
  audits: {
    url: string;
    score: number | null;
    errors: number;
    warnings: number;
    passed: number;
    issues: { id: string; category: string; severity: string; value?: string; params?: Record<string, string | number> }[];
    schemaTypes: string[];
    hreflang: number;
    lang: string | null;
    created_at: string;
  }[];
  keywords: { keyword: string; country: string; locale: string; intent: string | null; difficulty: number | null; priority: string | null; position: number | null }[];
  rankings: { total: number; tracked: number; top3: number; top10: number; top30: number; best: { keyword: string; position: number; country: string }[] };
  competitors: { domain: string; appearances: number; bestRank: number }[];
  researchQueries: string[];
  /** Sản phẩm đã xác nhận (nhập tay hoặc từ website có trích dẫn) */
  products?: { name: string; category: string | null; certifications: string[] }[];
}

/** Trang mạng xã hội / bách khoa / sàn chung — không coi là đối thủ trực tiếp */
const NOT_COMPETITORS = /(^|\.)(linkedin|facebook|youtube|instagram|twitter|x|tiktok|pinterest|reddit|quora|wikipedia|medium)\.(com|org)$/;

/** Gom dữ liệu đã có của dự án thành ảnh chụp dùng cho báo cáo. */
export async function collectReportData(supabase: SupabaseClient, project: Project): Promise<ReportData> {
  const [audits, keywords, ranked, stats, research, products] = await Promise.all([
    supabase.from("audits").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).limit(40),
    supabase
      .from("keywords")
      .select("keyword, country, locale, intent, difficulty, priority, current_position, status")
      .eq("project_id", project.id)
      .neq("status", "ignored")
      .order("priority", { ascending: true, nullsFirst: false })
      .order("difficulty", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase
      .from("keywords")
      .select("keyword, country, current_position")
      .eq("project_id", project.id)
      .not("current_position", "is", null)
      .order("current_position")
      .limit(10),
    supabase.rpc("keyword_stats", { p_project: project.id }).maybeSingle<Record<string, number>>(),
    supabase.from("keyword_research").select("seed, serp").eq("project_id", project.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("project_products").select("name, category, certifications").eq("project_id", project.id).limit(30),
  ]);

  // Audit mới nhất của mỗi URL, tối đa 6 trang
  const seen = new Set<string>();
  const latest = ((audits.data ?? []) as Audit[]).filter((a) => !seen.has(a.url) && seen.add(a.url)).slice(0, 6);

  // Ưu tiên Cao → Trung bình → Thấp ("high" < "low" < "medium" theo chữ cái nên sắp lại)
  const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  const kw = (keywords.data ?? [])
    .sort((a, b) => (rank[a.priority ?? ""] ?? 3) - (rank[b.priority ?? ""] ?? 3) || (a.difficulty ?? 101) - (b.difficulty ?? 101))
    .slice(0, 15);

  // Đối thủ: domain xuất hiện trong top 10 Google của các lần nghiên cứu gần đây
  const own = hostOf(project.domain);
  const comp = new Map<string, { appearances: number; bestRank: number }>();
  for (const r of research.data ?? []) {
    for (const o of ((r.serp as SerpResult | null)?.organic ?? []).slice(0, 10)) {
      const d = hostOf(o.link);
      if (!d || d === own || d.endsWith(`.${own}`) || NOT_COMPETITORS.test(d)) continue;
      const c = comp.get(d) ?? { appearances: 0, bestRank: 99 };
      c.appearances++;
      c.bestRank = Math.min(c.bestRank, o.rank);
      comp.set(d, c);
    }
  }

  const st = stats.data ?? {};
  return {
    project: { name: project.name, domain: project.domain, industry: project.industry, markets: project.markets ?? [], locales: project.locales },
    audits: latest.map((a) => {
      const page = (a.page ?? {}) as { schemaTypes?: string[]; hreflang?: unknown[]; lang?: string | null };
      return {
        url: a.url,
        score: a.score,
        errors: a.checks.filter((c) => c.severity === "error").length,
        warnings: a.checks.filter((c) => c.severity === "warning").length,
        passed: a.checks.filter((c) => c.severity === "pass").length,
        issues: a.checks
          .filter((c) => c.severity === "error" || c.severity === "warning")
          .map((c) => ({ id: c.id, category: c.category, severity: c.severity, value: c.value, params: c.params })),
        schemaTypes: page.schemaTypes ?? [],
        hreflang: page.hreflang?.length ?? 0,
        lang: page.lang ?? null,
        created_at: a.created_at,
      };
    }),
    keywords: kw.map((k) => ({
      keyword: k.keyword,
      country: k.country,
      locale: k.locale,
      intent: k.intent,
      difficulty: k.difficulty,
      priority: k.priority,
      position: k.current_position,
    })),
    rankings: {
      total: st.total ?? 0,
      tracked: st.tracked ?? 0,
      top3: st.top3 ?? 0,
      top10: st.top10 ?? 0,
      top30: st.top30 ?? 0,
      best: (ranked.data ?? []).map((r) => ({ keyword: r.keyword, position: r.current_position as number, country: r.country })),
    },
    competitors: [...comp.entries()]
      .map(([domain, c]) => ({ domain, ...c }))
      .sort((a, b) => b.appearances - a.appearances || a.bestRank - b.bestRank)
      .slice(0, 8),
    researchQueries: (research.data ?? []).map((r) => r.seed),
    products: products.data ?? [],
  };
}
