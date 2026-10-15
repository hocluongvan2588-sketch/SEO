import "server-only";
import * as cheerio from "cheerio";
import { fetchPage } from "./brightdata";
import { hostOf, normalizeUrl } from "./utils";

export interface ScannedPage {
  url: string;
  title: string;
  /** Nội dung chữ đã làm sạch (cắt ngắn) — chính là dữ liệu AI được đọc và dùng để đối chiếu trích dẫn */
  text: string;
  lang: string | null;
}

export interface SiteFacts {
  /** Ngôn ngữ khai báo trên trang chủ (<html lang>) */
  homeLang: string | null;
  /** Các phiên bản ngôn ngữ khai báo bằng hreflang */
  hreflang: string[];
  pagesRead: number;
}

const MAX_PAGES = 10;
const MAX_CHARS_PER_PAGE = 6000;

/** Từ gợi ý trang sản phẩm / dịch vụ / giới thiệu (Việt + Anh) trong URL hoặc chữ của link */
const PRIORITY = [
  /san-?pham|product|shop|catalog|collection|danh-?muc|category/i,
  /dich-?vu|service|oem|odm|gia-?cong|private-?label|manufactur/i,
  /gioi-?thieu|about|chung-?nhan|certif|nha-?may|factory|quality/i,
];
const SKIP = /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|css|js)(\?|$)|\/(cart|checkout|login|account|wp-admin|tag|author|feed)\b|[?&](add-to-cart|replytocom)=|mailto:|tel:|javascript:/i;

function pageText($: cheerio.CheerioAPI) {
  $("script, style, noscript, svg, iframe, template").remove();
  const parts = [
    $("title").first().text(),
    $('meta[name="description"]').attr("content") ?? "",
    $("body").text(),
  ];
  return parts.join("\n").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_PER_PAGE);
}

/**
 * Đọc trang chủ + tối đa 9 trang nội bộ quan trọng (sản phẩm, dịch vụ, giới thiệu) qua Bright Data.
 * Chỉ trả về nội dung thật đọc được — không suy đoán gì ở bước này.
 */
export async function crawlSite(startUrl: string): Promise<{ pages: ScannedPage[]; facts: SiteFacts }> {
  const home = normalizeUrl(startUrl);
  const host = hostOf(home);
  const first = await fetchPage(home);
  const $ = cheerio.load(first.html);

  const facts: SiteFacts = {
    homeLang: $("html").attr("lang")?.trim() || null,
    hreflang: Array.from(new Set($('link[rel="alternate"][hreflang]').map((_, el) => $(el).attr("hreflang") ?? "").get().filter(Boolean))),
    pagesRead: 0,
  };

  // Chọn link nội bộ, ưu tiên trang sản phẩm → dịch vụ → giới thiệu
  const candidates = new Map<string, number>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href || href.startsWith("#") || SKIP.test(href)) return;
    let abs: URL;
    try {
      abs = new URL(href, home);
    } catch {
      return;
    }
    if (hostOf(abs.href) !== host) return;
    abs.hash = "";
    const key = abs.href.replace(/\/$/, "");
    if (key === home.replace(/\/$/, "")) return;
    const label = `${abs.pathname} ${$(el).text()}`;
    const idx = PRIORITY.findIndex((re) => re.test(label));
    const score = idx === -1 ? 10 : idx;
    candidates.set(key, Math.min(candidates.get(key) ?? 99, score));
  });
  const picked = [...candidates.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].length - b[0].length)
    .slice(0, MAX_PAGES - 1)
    .map(([u]) => u);

  const pages: ScannedPage[] = [{ url: home, title: $("title").first().text().trim(), text: pageText($), lang: facts.homeLang }];

  // Tải song song 3 trang một lúc; trang lỗi thì bỏ qua
  for (let i = 0; i < picked.length; i += 3) {
    const batch = await Promise.all(
      picked.slice(i, i + 3).map(async (url) => {
        try {
          const r = await fetchPage(url);
          if (r.status >= 400) return null;
          const $p = cheerio.load(r.html);
          return { url, title: $p("title").first().text().trim(), text: pageText($p), lang: $p("html").attr("lang")?.trim() || null };
        } catch {
          return null;
        }
      }),
    );
    pages.push(...batch.filter((p): p is ScannedPage => !!p && p.text.length > 50));
  }
  facts.pagesRead = pages.length;
  return { pages, facts };
}

// ---------------------------------------------------------------------------
// Chống bịa dữ kiện: đối chiếu trích dẫn AI đưa ra với nội dung trang thật
// ---------------------------------------------------------------------------
const norm = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[“”"'‘’`´]/g, "")
    .replace(/[^\p{L}\p{N}%+.,/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Trích dẫn có thật trên trang không?
 * - Khớp nguyên văn (sau khi chuẩn hóa khoảng trắng, dấu nháy, hoa/thường) → đúng
 * - Hoặc ≥ 90% từ của trích dẫn xuất hiện theo đúng thứ tự trong trang (chịu được khác biệt nhỏ do định dạng)
 */
export function quoteFound(quote: string, pageText: string): boolean {
  const q = norm(quote);
  const t = norm(pageText);
  if (q.length < 4) return false;
  if (t.includes(q)) return true;
  const words = q.split(" ").filter((w) => w.length > 1);
  if (words.length < 6) return false; // câu ngắn phải khớp nguyên văn
  let pos = 0;
  let hits = 0;
  for (const w of words) {
    const at = t.indexOf(w, pos);
    if (at !== -1) {
      hits++;
      pos = at + w.length;
    } else if (/\d/.test(w)) {
      return false; // con số / mã quy cách (15%, SPF50+, W320…) không được phép sai
    }
  }
  return hits / words.length >= 0.9;
}

/** Tên (sản phẩm/chứng nhận) có trên trang không: chứng nhận phải khớp nguyên văn; sản phẩm ≥ 80% từ và đủ mọi con số. */
export function nameFound(name: string, pageText: string, strict: boolean): boolean {
  const n = norm(name);
  const t = norm(pageText);
  if (!n) return false;
  if (t.includes(n)) return true;
  if (strict) return false;
  const words = n.split(" ").filter((w) => w.length > 1);
  if (!words.length) return false;
  let hits = 0;
  for (const w of words) {
    if (t.includes(w)) hits++;
    else if (/\d/.test(w)) return false;
  }
  return hits / words.length >= 0.8;
}

/**
 * Tìm trang chứa trích dẫn: ưu tiên trang AI ghi là nguồn, nếu sai thì dò mọi trang đã đọc.
 * Nếu truyền `name`, tên đó cũng phải có trên chính trang ấy (chặn trường hợp trích dẫn thật nhưng gán tên bịa).
 */
export function verifyQuote(
  quote: string,
  claimedUrl: string,
  pages: ScannedPage[],
  name?: { value: string; strict: boolean },
): string | null {
  const ok = (p: ScannedPage) => quoteFound(quote, p.text) && (!name || nameFound(name.value, p.text, name.strict));
  const claimed = pages.find((p) => p.url.replace(/\/$/, "") === claimedUrl.replace(/\/$/, ""));
  if (claimed && ok(claimed)) return claimed.url;
  return pages.find(ok)?.url ?? null;
}
