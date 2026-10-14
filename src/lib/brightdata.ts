import "server-only";
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

/**
 * Gọi API Bright Data, tự thử lại tối đa 3 lần khi bị timeout / quá tải
 * (zone mới tạo hoặc Google phản hồi chậm thường gây lỗi tạm thời).
 */
async function request(zone: string, url: string, country?: string): Promise<{ body: string; status: number }> {
  const { apiKey } = config();
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ zone, url, format: "raw", ...(country ? { country } : {}) }),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      const body = await res.text();
      const timedOut = /^\s*timeout\s*$/i.test(body);
      if (res.ok && !timedOut) {
        recordBrightData(1);
        return { body, status: res.status };
      }
      lastError = `Bright Data ${res.status}: ${body.slice(0, 200)}`;
      if (!RETRYABLE.has(res.status) && !timedOut) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  throw new BrightDataError(`${lastError} (zone: ${zone})`);
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

/** Tìm kiếm Google qua SERP API của Bright Data, trả về JSON đã parse. */
export async function googleSearch(
  query: string,
  opts: { hl: string; gl: string; start?: number },
): Promise<SerpResult> {
  const { serpZone } = config();
  const params = new URLSearchParams({ q: query, hl: opts.hl, gl: opts.gl, brd_json: "1" });
  if (opts.start) params.set("start", String(opts.start));
  // Đi qua proxy đặt tại chính quốc gia mục tiêu để kết quả giống người dùng ở đó
  const { body } = await request(serpZone, `https://www.google.com/search?${params}`, opts.gl);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body);
  } catch {
    throw new BrightDataError(`Bright Data không trả về JSON (kiểm tra zone ${serpZone} là loại SERP API): ${body.slice(0, 120)}`);
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
