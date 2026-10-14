import "server-only";
import * as cheerio from "cheerio";
import { recordBrightData } from "./usage";

const ENDPOINT = "https://api.brightdata.com/request";

export class BrightDataError extends Error {}

function config() {
  const apiKey = process.env.BRIGHTDATA_API_TOKEN;
  if (!apiKey) throw new BrightDataError("BRIGHTDATA_API_TOKEN chưa được cấu hình");
  return {
    apiKey,
    serpZone: process.env.BRIGHTDATA_SERP_ZONE || "serp_api1",
    unlockerZone: process.env.BRIGHTDATA_UNLOCKER_ZONE || "web_unlocker1",
  };
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

interface RequestOptions {
  /** Đặt proxy tại quốc gia này (mã 2 chữ cái) */
  country?: string;
  /** Tham số thêm cho API, ví dụ { format: "json", data_format: "parsed" } */
  extra?: Record<string, unknown>;
  attempts?: number;
}

/**
 * Gọi API Bright Data, tự thử lại khi bị timeout / quá tải / trả về rỗng
 * (zone mới tạo hoặc Google phản hồi chậm thường gây lỗi tạm thời).
 * Lý do lỗi Bright Data gửi trong header `x-brd-error` được đưa vào thông báo.
 */
async function request(zone: string, url: string, opts: RequestOptions = {}): Promise<{ body: string; status: number }> {
  const { apiKey } = config();
  const attempts = opts.attempts ?? 3;
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ zone, url, format: "raw", ...(opts.country ? { country: opts.country } : {}), ...opts.extra }),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      const body = await res.text();
      // Bright Data tạm khóa một câu vừa thất bại — thử lại ngay (kể cả đổi định dạng) đều vô ích
      if (/recently failed and cannot be attempted/i.test(body)) throw new SerpCooldownError();
      const timedOut = /^\s*timeout\s*$/i.test(body);
      const empty = !body.trim();
      if (res.ok && !timedOut && !empty) {
        recordBrightData(1);
        return { body, status: res.status };
      }
      const reason = res.headers.get("x-brd-error") ?? res.headers.get("x-luminati-error") ?? "";
      lastError = `Bright Data ${res.status}: ${empty ? "phản hồi rỗng" : body.slice(0, 200)}${reason ? ` — ${reason}` : ""}`;
      if (!RETRYABLE.has(res.status) && !timedOut && !empty) break;
    } catch (err) {
      if (err instanceof SerpCooldownError) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  throw new BrightDataError(`${lastError} (zone: ${zone})`);
}

/** Câu tìm kiếm vừa thất bại nên Bright Data tạm khóa — không tính phí, thử lại sau vài phút */
export class SerpCooldownError extends BrightDataError {
  constructor() {
    super("Bright Data tạm khóa câu tìm kiếm này vì vừa thất bại ít phút trước — hãy thử lại sau 5–10 phút");
  }
}

export interface SerpOrganic {
  rank: number;
  title: string;
  link: string;
  description?: string;
}

export interface SerpResult {
  query: string;
  organic: SerpOrganic[];
  peopleAlsoAsk: string[];
  related: string[];
}

/**
 * Đọc kết quả SERP từ phản hồi Bright Data. Chấp nhận:
 * JSON đã parse, JSON bọc ngoài dạng { status_code, body }, hoặc HTML gốc của Google.
 */
function parseSerpBody(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("<")) return parseGoogleHtml(t);
  let j: unknown;
  try {
    j = JSON.parse(t);
  } catch {
    return null;
  }
  const obj = j as Record<string, unknown>;
  if (typeof obj.body === "string") return parseSerpBody(obj.body);
  if (obj.body && typeof obj.body === "object") return obj.body as Record<string, unknown>;
  return obj;
}

/** Dự phòng cuối: tự đọc kết quả tự nhiên từ HTML trang Google */
function parseGoogleHtml(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html);
  const organic: { title: string; link: string; description?: string }[] = [];
  $("a:has(h3)").each((_, el) => {
    let href = $(el).attr("href") ?? "";
    if (href.startsWith("/url?")) href = new URLSearchParams(href.slice(5)).get("q") ?? "";
    if (!/^https?:\/\//.test(href) || /(^|\.)google\./.test(new URL(href).hostname)) return;
    const block = $(el).closest("div.g, div[data-hveid], div.MjjYud");
    organic.push({
      title: $(el).find("h3").first().text().trim(),
      link: href,
      description: block.find("div.VwiC3b, span.aCOpRe, div[data-sncf]").first().text().trim() || undefined,
    });
  });
  const related = $("a[href^='/search?'] div.s75CSd, div.y6Uyqe a, a.k8XOCe")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  return organic.length ? { organic, related, people_also_ask: [] } : null;
}

/** Tìm kiếm Google qua SERP API của Bright Data, trả về kết quả đã parse. */
export async function googleSearch(
  query: string,
  opts: { hl: string; gl: string; start?: number },
): Promise<SerpResult> {
  const { serpZone } = config();
  const params = new URLSearchParams({ q: query, hl: opts.hl, gl: opts.gl });
  if (opts.start) params.set("start", String(opts.start));
  const base = `https://www.google.com/search?${params}`;

  // Thử lần lượt: (1) JSON qua brd_json + proxy tại nước mục tiêu,
  // (2) định dạng parsed như Bright Data gợi ý cho zone, (3) HTML gốc rồi tự đọc.
  const stages: { url: string; opts: RequestOptions }[] = [
    { url: `${base}&brd_json=1`, opts: { country: opts.gl, attempts: 2 } },
    { url: base, opts: { extra: { format: "json", data_format: "parsed" }, attempts: 1 } },
    { url: base, opts: { attempts: 1 } },
  ];
  let data: Record<string, unknown> | null = null;
  const problems: string[] = [];
  for (const stage of stages) {
    try {
      const { body } = await request(serpZone, stage.url, stage.opts);
      data = parseSerpBody(body);
      if (data) break;
      problems.push(`không đọc được kết quả: ${body.slice(0, 80)}`);
    } catch (err) {
      if (err instanceof SerpCooldownError) throw err;
      problems.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (!data) {
    throw new BrightDataError(`Không lấy được kết quả Google từ zone ${serpZone}. ${problems.at(-1) ?? ""}`);
  }

  const organic = Array.isArray(data.organic) ? (data.organic as Record<string, unknown>[]) : [];
  const paa = Array.isArray(data.people_also_ask) ? (data.people_also_ask as Record<string, unknown>[]) : [];
  const related = Array.isArray(data.related) ? (data.related as Record<string, unknown>[]) : [];

  return {
    query,
    organic: organic
      .map((o, i) => ({
        rank: Number(o.global_rank ?? o.rank ?? i + 1),
        title: String(o.title ?? ""),
        link: String(o.link ?? o.url ?? ""),
        description: o.description ? String(o.description) : undefined,
      }))
      .filter((o) => o.link),
    peopleAlsoAsk: paa.map((p) => String(p.question ?? p.title ?? "")).filter(Boolean),
    related: related.map((r) => String(r.text ?? r.title ?? r.query ?? "")).filter(Boolean),
  };
}

/** Tải HTML của một trang qua Web Unlocker (vượt chặn bot/CAPTCHA). */
export async function fetchPage(url: string): Promise<{ html: string; status: number; via: "brightdata" | "direct" }> {
  try {
    const { unlockerZone } = config();
    const { body, status } = await request(unlockerZone, url);
    return { html: body, status, via: "brightdata" };
  } catch (err) {
    // Fallback: tải trực tiếp nếu chưa cấu hình Bright Data hoặc zone lỗi
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOHubBot/1.0)" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) throw err;
    return { html: await res.text(), status: res.status, via: "direct" };
  }
}

/** Tìm vị trí của domain trong top 30 kết quả Google. */
export async function findRank(
  keyword: string,
  domain: string,
  opts: { hl: string; gl: string },
): Promise<{ position: number | null; url: string | null }> {
  const host = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  let offset = 0;
  for (let page = 0; page < 3; page++) {
    const serp = await googleSearch(keyword, { ...opts, start: page * 10 });
    const hit = serp.organic.findIndex((o) => {
      try {
        const h = new URL(o.link).hostname.replace(/^www\./, "");
        return h === host || h.endsWith(`.${host}`);
      } catch {
        return false;
      }
    });
    if (hit >= 0) return { position: offset + hit + 1, url: serp.organic[hit].link };
    if (serp.organic.length === 0) break;
    offset += serp.organic.length;
  }
  return { position: null, url: null };
}

/** Số dư tài khoản Bright Data (USD). null nếu chưa cấu hình hoặc API lỗi. */
export async function getBalance(): Promise<{ balance: number; pending: number } | null> {
  const apiKey = process.env.BRIGHTDATA_API_TOKEN;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.brightdata.com/customer/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { balance?: number; pending_balance?: number };
    return { balance: Number(data.balance ?? 0), pending: Number(data.pending_balance ?? 0) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LinkedIn — tìm buyer & lấy hồ sơ công khai
// ---------------------------------------------------------------------------

export interface LinkedInCandidate {
  url: string;
  name: string;
  headline: string;
  snippet?: string;
}

/** Chuẩn hóa link hồ sơ: https://www.linkedin.com/in/<slug>/ (bỏ mã vùng, query). */
export function normalizeLinkedInUrl(raw: string): string | null {
  try {
    const trimmed = raw.trim();
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/in\/([^/]+)/i);
    if (!m) return null;
    return `https://www.linkedin.com/in/${decodeURIComponent(m[1]).toLowerCase()}/`;
  } catch {
    return null;
  }
}

/**
 * Tìm hồ sơ LinkedIn công khai qua Google (zone SERP sẵn có).
 * Chạy lần lượt các câu truy vấn từ chặt đến rộng, dừng khi đủ `target` hồ sơ.
 * Mỗi trang 10 kết quả = 1 request SERP.
 */
export async function findLinkedInProfiles(
  queries: string[],
  opts: { gl: string; target?: number },
): Promise<{ candidates: LinkedInCandidate[]; queriesUsed: string[] }> {
  const target = opts.target ?? 20;
  const seen = new Map<string, LinkedInCandidate>();
  const queriesUsed: string[] = [];
  for (const query of queries) {
    if (seen.size >= target) break;
    queriesUsed.push(query);
    for (let page = 0; page < 2 && seen.size < target; page++) {
      const serp = await googleSearch(query, { hl: "en", gl: opts.gl, start: page * 10 });
      for (const o of serp.organic) {
        const url = normalizeLinkedInUrl(o.link);
        if (!url || seen.has(url)) continue;
        // Tiêu đề Google dạng "Jane Doe - Purchasing Manager - Acme Foods | LinkedIn"
        const title = o.title.replace(/\s*[|·]\s*LinkedIn.*$/i, "");
        const [name, ...rest] = title.split(/\s+[-–—|]\s+/);
        seen.set(url, { url, name: name?.trim() ?? "", headline: rest.join(" · ").trim(), snippet: o.description });
      }
      if (serp.organic.length < 8) break; // hết kết quả cho câu này
    }
  }
  return { candidates: [...seen.values()].slice(0, target), queriesUsed };
}

export interface LinkedInProfile {
  url: string;
  name: string | null;
  headline: string | null;
  company: string | null;
  companyUrl: string | null;
  location: string | null;
  countryCode: string | null;
  about: string | null;
  experience: { title?: string; company?: string; duration?: string }[];
  avatarUrl: string | null;
  error?: string;
}

const LINKEDIN_PROFILE_DATASET = process.env.BRIGHTDATA_LINKEDIN_DATASET || "gd_l1viktl72bvl7bjuj0";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Giá trị chuỗi đầu tiên có nội dung */
const first = (...vals: unknown[]) => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return null;
};

/** Một mục kinh nghiệm; công ty có nhiều vị trí thì lấy vị trí mới nhất trong `positions` */
function mapExperience(e: Record<string, unknown>) {
  const inner = Array.isArray(e.positions) ? ((e.positions as Record<string, unknown>[])[0] ?? {}) : {};
  const start = first(inner.start_date, e.start_date);
  return {
    title: first(e.title, inner.title, e.position) ?? undefined,
    company: first(e.company, e.company_name, e.subtitle, e.name) ?? undefined,
    duration: first(e.duration, inner.duration) ?? (start ? `${start} – ${first(inner.end_date, e.end_date) ?? "now"}` : undefined),
  };
}

function mapProfile(r: Record<string, unknown>, fallbackUrl: string): LinkedInProfile {
  const cc = (r.current_company ?? {}) as Record<string, unknown>;
  const exp = Array.isArray(r.experience) ? (r.experience as Record<string, unknown>[]).map(mapExperience) : [];
  const input = (r.input ?? {}) as Record<string, unknown>;
  const firstName = str(r.first_name);
  return {
    url: normalizeLinkedInUrl(String(r.input_url ?? input.url ?? r.url ?? fallbackUrl)) ?? fallbackUrl,
    name: str(r.name) ?? (firstName ? `${firstName} ${str(r.last_name) ?? ""}`.trim() : null),
    // Tên trường khác nhau giữa các phiên bản dataset → thử lần lượt, cuối cùng là kinh nghiệm gần nhất
    headline: first(r.position, r.headline, r.title, r.job_title, cc.title, cc.position, exp[0]?.title),
    company: first(cc.name, r.current_company_name, r.company, r.company_name, exp[0]?.company),
    companyUrl: first(cc.link, cc.url),
    location: first(r.city, r.location),
    countryCode: str(r.country_code)?.toLowerCase() ?? null,
    about: str(r.about)?.slice(0, 2000) ?? null,
    experience: exp.slice(0, 4),
    avatarUrl: str(r.avatar) ?? str(r.image_url),
    error: str(r.error) ?? str(r.error_code) ?? undefined,
  };
}

async function datasetsFetch(path: string, init?: RequestInit) {
  const { apiKey } = config();
  return fetch(`https://api.brightdata.com/datasets/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
}

function parseRecords(text: string): unknown[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith("[")) return JSON.parse(t);
  if (t.startsWith("{") && !t.includes("\n")) return [JSON.parse(t)];
  return t.split("\n").filter(Boolean).map((l) => JSON.parse(l)); // ndjson
}

/**
 * Lấy hồ sơ LinkedIn công khai theo URL (tối đa 20 URL/lần, chế độ đồng bộ).
 * Bright Data xử lý quá 1 phút → trả 202 + snapshot_id → chờ rồi tải về.
 * Tính phí theo số bản ghi trả về ($1.50 / 1.000).
 */
export async function scrapeLinkedInProfiles(urls: string[]): Promise<LinkedInProfile[]> {
  const input = urls.slice(0, 20).map((url) => ({ url }));
  if (!input.length) return [];
  // notify=false: không gửi email thông báo cho mỗi lần nhân viên lấy hồ sơ
  const qs = `dataset_id=${LINKEDIN_PROFILE_DATASET}&format=json&include_errors=true&notify=false`;
  const res = await datasetsFetch(`/scrape?${qs}`, { method: "POST", body: JSON.stringify({ input }) });

  let records: unknown[];
  if (res.status === 202) {
    const { snapshot_id } = (await res.json()) as { snapshot_id?: string };
    if (!snapshot_id) throw new BrightDataError("Bright Data không trả về snapshot_id");
    records = await waitForSnapshot(snapshot_id);
  } else if (res.ok) {
    records = parseRecords(await res.text());
  } else {
    const body = await res.text().catch(() => "");
    if (/customer is not active/i.test(body)) {
      throw new BrightDataError(
        "Tài khoản Bright Data chưa được kích hoạt cho Web Scraper API (scraper LinkedIn). " +
          "Vào Bright Data → Billing để thêm phương thức thanh toán / nạp tiền hoặc hoàn tất xác minh tài khoản, rồi thử lại.",
      );
    }
    throw new BrightDataError(`Bright Data ${res.status}: ${body.slice(0, 200)} (dataset: ${LINKEDIN_PROFILE_DATASET})`);
  }

  recordBrightData(records.length);
  const list = records as Record<string, unknown>[];
  // Ghi lại tên trường để đối chiếu khi Bright Data đổi cấu trúc dữ liệu
  if (list[0]) console.info("[brightdata] linkedin profile fields:", Object.keys(list[0]).join(","));
  return list.map((r, i) => mapProfile(r, input[i]?.url ?? ""));
}

async function waitForSnapshot(id: string): Promise<unknown[]> {
  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const p = await datasetsFetch(`/progress/${id}`);
    const { status } = (await p.json().catch(() => ({}))) as { status?: string };
    if (status === "ready") {
      const s = await datasetsFetch(`/snapshot/${id}?format=json`);
      if (!s.ok) throw new BrightDataError(`Bright Data snapshot ${s.status}`);
      return parseRecords(await s.text());
    }
    if (status === "failed") throw new BrightDataError("Bright Data: lấy hồ sơ thất bại");
  }
  throw new BrightDataError(`Bright Data chưa xử lý xong (snapshot ${id}), hãy thử lại sau ít phút`);
}
