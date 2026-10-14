import "server-only";
import * as cheerio from "cheerio";
import type { AuditCheck } from "./types";

export interface PageData {
  url: string;
  status: number;
  title: string;
  metaDescription: string;
  h1: string[];
  headings: { level: number; text: string }[];
  canonical: string | null;
  robots: string | null;
  lang: string | null;
  viewport: boolean;
  hreflang: { lang: string; href: string }[];
  og: Record<string, string>;
  schemaTypes: string[];
  wordCount: number;
  images: { total: number; missingAlt: number };
  links: { internal: number; external: number; nofollow: number };
}

export function extractText(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export function parsePage(url: string, html: string, status: number): PageData {
  const $ = cheerio.load(html);
  const host = new URL(url).hostname.replace(/^www\./, "");

  const schemaTypes = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === "object") {
          const n = node as Record<string, unknown>;
          const t = n["@type"];
          if (typeof t === "string") schemaTypes.add(t);
          if (Array.isArray(t)) t.forEach((x) => schemaTypes.add(String(x)));
          if (n["@graph"]) walk(n["@graph"]);
        }
      };
      walk(json);
    } catch {
      schemaTypes.add("invalid-json");
    }
  });

  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    og[$(el).attr("property")!] = $(el).attr("content") ?? "";
  });

  let internal = 0,
    external = 0,
    nofollow = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")!;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    if (($(el).attr("rel") ?? "").includes("nofollow")) nofollow++;
    try {
      const h = new URL(href, url).hostname.replace(/^www\./, "");
      if (h === host) internal++;
      else external++;
    } catch {
      /* ignore */
    }
  });

  const images = $("img");
  const missingAlt = images.filter((_, el) => !($(el).attr("alt") ?? "").trim()).length;

  const text = extractText(html);
  // Đếm từ: với ngôn ngữ CJK/Thai không có khoảng trắng, quy đổi ký tự
  const cjk = (text.match(/[぀-ヿ㐀-鿿가-힯฀-๿]/g) ?? []).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const wordCount = cjk > words ? Math.round(cjk / 2) : words;

  return {
    url,
    status,
    title: $("head title").first().text().trim(),
    metaDescription: $('meta[name="description"]').attr("content")?.trim() ?? "",
    h1: $("h1").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get(),
    headings: $("h1, h2, h3, h4")
      .slice(0, 40)
      .map((_, el) => ({ level: Number(el.tagName.slice(1)), text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 120) }))
      .get(),
    canonical: $('link[rel="canonical"]').attr("href") ?? null,
    robots: $('meta[name="robots"]').attr("content") ?? null,
    lang: $("html").attr("lang") ?? null,
    viewport: $('meta[name="viewport"]').length > 0,
    hreflang: $('link[rel="alternate"][hreflang]')
      .map((_, el) => ({ lang: $(el).attr("hreflang")!, href: $(el).attr("href") ?? "" }))
      .get(),
    og,
    schemaTypes: [...schemaTypes],
    wordCount,
    images: { total: images.length, missingAlt },
    links: { internal, external, nofollow },
  };
}

export function runChecks(page: PageData, opts: { projectLocales: string[] }): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const add = (c: AuditCheck) => checks.push(c);

  // Technical
  add({ id: "status", category: "technical", severity: page.status >= 400 ? "error" : "pass", params: { status: page.status } });
  add({ id: "https", category: "technical", severity: page.url.startsWith("https://") ? "pass" : "error" });
  add({ id: "viewport", category: "technical", severity: page.viewport ? "pass" : "error" });
  const noindex = /noindex/i.test(page.robots ?? "");
  add({ id: "indexable", category: "technical", severity: noindex ? "error" : "pass", value: page.robots ?? undefined });
  if (!page.canonical) add({ id: "canonical_missing", category: "technical", severity: "warning" });
  else {
    let same = false;
    try {
      same = new URL(page.canonical, page.url).href.replace(/\/$/, "") === page.url.replace(/\/$/, "");
    } catch {
      /* ignore */
    }
    add({ id: same ? "canonical_ok" : "canonical_other", category: "technical", severity: same ? "pass" : "info", value: page.canonical });
  }

  // Meta
  const tl = page.title.length;
  if (!tl) add({ id: "title_missing", category: "meta", severity: "error" });
  else
    add({
      id: tl < 30 ? "title_short" : tl > 60 ? "title_long" : "title_ok",
      category: "meta",
      severity: tl < 30 || tl > 60 ? "warning" : "pass",
      value: page.title,
      params: { length: tl },
    });
  const dl = page.metaDescription.length;
  if (!dl) add({ id: "desc_missing", category: "meta", severity: "error" });
  else
    add({
      id: dl < 70 ? "desc_short" : dl > 160 ? "desc_long" : "desc_ok",
      category: "meta",
      severity: dl < 70 || dl > 160 ? "warning" : "pass",
      value: page.metaDescription,
      params: { length: dl },
    });
  const ogMissing = ["og:title", "og:description", "og:image"].filter((k) => !page.og[k]);
  add({
    id: ogMissing.length ? "og_missing" : "og_ok",
    category: "meta",
    severity: ogMissing.length ? "warning" : "pass",
    params: { tags: ogMissing.join(", ") },
  });

  // Content
  if (page.h1.length === 0) add({ id: "h1_missing", category: "content", severity: "error" });
  else if (page.h1.length > 1) add({ id: "h1_multiple", category: "content", severity: "warning", params: { count: page.h1.length } });
  else add({ id: "h1_ok", category: "content", severity: "pass", value: page.h1[0] });
  let skipped = false;
  for (let i = 1; i < page.headings.length; i++) {
    if (page.headings[i].level - page.headings[i - 1].level > 1) skipped = true;
  }
  if (skipped) add({ id: "heading_skip", category: "content", severity: "warning" });
  add({
    id: page.wordCount < 300 ? "thin_content" : "content_length_ok",
    category: "content",
    severity: page.wordCount < 300 ? "warning" : "pass",
    params: { words: page.wordCount },
  });

  // Images
  if (page.images.total > 0)
    add({
      id: page.images.missingAlt ? "img_alt_missing" : "img_alt_ok",
      category: "images",
      severity: page.images.missingAlt ? "warning" : "pass",
      params: { missing: page.images.missingAlt, total: page.images.total },
    });

  // Links
  add({
    id: page.links.internal < 3 ? "few_internal_links" : "internal_links_ok",
    category: "links",
    severity: page.links.internal < 3 ? "warning" : "pass",
    params: { count: page.links.internal },
  });

  // Structured data
  if (page.schemaTypes.includes("invalid-json")) add({ id: "schema_invalid", category: "structured-data", severity: "error" });
  add({
    id: page.schemaTypes.length ? "schema_ok" : "schema_missing",
    category: "structured-data",
    severity: page.schemaTypes.length ? "pass" : "warning",
    value: page.schemaTypes.filter((t) => t !== "invalid-json").join(", ") || undefined,
  });

  // International (đa ngôn ngữ)
  add({ id: page.lang ? "lang_ok" : "lang_missing", category: "international", severity: page.lang ? "pass" : "warning", value: page.lang ?? undefined });
  if (opts.projectLocales.length > 1) {
    if (page.hreflang.length === 0) add({ id: "hreflang_missing", category: "international", severity: "warning" });
    else {
      const langs = page.hreflang.map((h) => h.lang.toLowerCase().split("-")[0]);
      const missing = opts.projectLocales.filter((l) => !langs.includes(l));
      if (missing.length) add({ id: "hreflang_incomplete", category: "international", severity: "warning", params: { locales: missing.join(", ") } });
      else add({ id: "hreflang_ok", category: "international", severity: "pass" });
      if (!page.hreflang.some((h) => h.lang.toLowerCase() === "x-default"))
        add({ id: "hreflang_xdefault", category: "international", severity: "info" });
    }
  }

  return checks;
}

export function scoreChecks(checks: AuditCheck[]) {
  const penalty = checks.reduce((s, c) => s + (c.severity === "error" ? 12 : c.severity === "warning" ? 5 : 0), 0);
  return Math.max(0, 100 - penalty);
}
