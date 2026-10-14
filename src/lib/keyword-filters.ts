/** Bộ lọc danh sách từ khóa — lưu trên URL (?q=&status=…) để lọc ngay trong database. */
export interface KeywordFilters {
  q?: string;
  status?: string;
  priority?: string;
  market?: string;
  locale?: string;
  cluster?: string;
  /** "cluster" = nhóm theo cụm */
  group?: string;
}

export const FILTER_KEYS = ["q", "status", "priority", "market", "locale", "cluster", "group"] as const;

export function readFilters(params: Record<string, string | string[] | undefined>): KeywordFilters {
  const out: KeywordFilters = {};
  for (const k of FILTER_KEYS) {
    const v = params[k];
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

interface Filterable<Q> {
  eq(column: string, value: string): Q;
  ilike(column: string, pattern: string): Q;
}

/** Áp bộ lọc vào câu truy vấn Supabase trên bảng keywords. */
export function applyKeywordFilters<Q extends Filterable<Q>>(query: Q, f: KeywordFilters): Q {
  let q = query;
  if (f.q) q = q.ilike("keyword", `%${f.q.replace(/[%_\\]/g, (c: string) => `\\${c}`)}%`);
  if (f.status) q = q.eq("status", f.status);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.market) q = q.eq("country", f.market);
  if (f.locale) q = q.eq("locale", f.locale);
  if (f.cluster) q = q.eq("cluster", f.cluster);
  return q;
}
