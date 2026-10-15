import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SerpResult } from "./brightdata";
import type { AuditCheck, Project } from "./types";
import { countryName, languageName } from "./locales";
import { recordClaude } from "./usage";

const localeLabel = (code: string) => languageName(code, "en");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY chưa được cấu hình");
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `You are a senior B2B SEO strategist working inside an internal SEO platform used by a company's marketing staff.
Be concrete and practical. Base your analysis on the data provided; when you estimate something (e.g. difficulty) say it is an estimate.
Write all explanations in the staff language given in the request; write keywords in the target content language.`;

async function structured<T extends z.ZodType>(
  schema: T,
  prompt: string,
  effort: "low" | "medium" | "high" = "medium",
): Promise<z.infer<T>> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: prompt }],
  });
  recordClaude({
    model: response.model,
    input: response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0),
    output: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
  });
  if (response.stop_reason === "refusal") throw new Error("Claude đã từ chối yêu cầu này");
  if (!response.parsed_output) throw new Error(`Claude không trả về kết quả hợp lệ (${response.stop_reason})`);
  return response.parsed_output as z.infer<T>;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ---------------------------------------------------------------------------
// Nghiên cứu từ khóa
// ---------------------------------------------------------------------------
const KeywordAnalysisSchema = z.object({
  summary: z.string().describe("3-5 sentence overview of the SERP landscape and opportunity"),
  keywords: z.array(
    z.object({
      keyword: z.string(),
      intent: z.enum(["informational", "commercial", "transactional", "navigational"]),
      difficulty: z.number().describe("Estimated ranking difficulty 0-100 based on who ranks in the SERP"),
      priority: z.enum(["high", "medium", "low"]),
      cluster: z.string().describe("Short topic cluster name"),
      content_type: z.string().describe("e.g. landing page, blog guide, comparison, case study, FAQ"),
      rationale: z.string(),
    }),
  ),
  content_gaps: z.array(z.string()),
  competitors: z.array(z.object({ domain: z.string(), note: z.string() })),
});
export type KeywordAnalysis = z.infer<typeof KeywordAnalysisSchema>;

export async function analyzeKeywords(input: {
  project: Project;
  seed: string;
  locale: string;
  country: string;
  serp: SerpResult;
  staffLocale: string;
}): Promise<KeywordAnalysis> {
  const { project, seed, locale, country, serp, staffLocale } = input;
  const result = await structured(
    KeywordAnalysisSchema,
    `Company: ${project.name} (${project.domain})
Industry: ${project.industry ?? "n/a"}
About: ${project.description ?? "n/a"}
Target content language: ${localeLabel(locale)} (${locale})\nTarget market: ${countryName(country, "en")} (${country.toUpperCase()}) — Google results below are localized for this market
Staff language for explanations: ${localeLabel(staffLocale)}

Seed keyword: "${seed}"

Live Google SERP (top results):
${serp.organic.slice(0, 10).map((o) => `${o.rank}. ${o.title} — ${o.link}\n   ${o.description ?? ""}`).join("\n")}

People also ask:
${serp.peopleAlsoAsk.map((q) => `- ${q}`).join("\n") || "- (none)"}

Related searches:
${serp.related.map((q) => `- ${q}`).join("\n") || "- (none)"}

Task: propose 15-25 keyword opportunities for this B2B company around the seed (include the seed itself, long-tail variants, questions from PAA, related searches, commercial-intent B2B terms such as "supplier", "pricing", "solution", "for enterprise" in the target language, using the wording buyers in this market actually use).
Group them into clusters, estimate difficulty from the strength of the ranking domains, and prioritise by business value for B2B lead generation.
List content gaps the SERP leaves open and briefly note the main competitor domains.`,
  );
  return { ...result, keywords: result.keywords.map((k) => ({ ...k, difficulty: clamp(k.difficulty) })) };
}

// ---------------------------------------------------------------------------
// Gom cụm từ khóa
// ---------------------------------------------------------------------------
const ClusterSchema = z.object({
  clusters: z.array(
    z.object({
      name: z.string(),
      pillar_keyword: z.string(),
      suggested_page: z.string().describe("Suggested page title / URL slug for the cluster"),
      keywords: z.array(z.string()),
    }),
  ),
});
export type ClusterResult = z.infer<typeof ClusterSchema>;

export async function clusterKeywords(input: {
  project: Project;
  keywords: string[];
  staffLocale: string;
}): Promise<ClusterResult> {
  return structured(
    ClusterSchema,
    `Company: ${input.project.name} (${input.project.domain}) — ${input.project.industry ?? ""}
Staff language: ${localeLabel(input.staffLocale)}

Group these keywords into topical clusters, each mapped to one page (pillar + supporting keywords).
Every keyword must appear in exactly one cluster, copied verbatim.

${input.keywords.map((k) => `- ${k}`).join("\n")}`,
    "low",
  );
}

// ---------------------------------------------------------------------------
// Nhận định audit
// ---------------------------------------------------------------------------
const AuditAiSchema = z.object({
  summary: z.string(),
  fixes: z.array(
    z.object({
      title: z.string(),
      detail: z.string().describe("Exact, actionable instruction (include suggested text/code where useful)"),
      impact: z.enum(["high", "medium", "low"]),
      effort: z.enum(["high", "medium", "low"]),
    }),
  ),
});

export async function auditInsights(input: {
  url: string;
  checks: AuditCheck[];
  page: Record<string, unknown>;
  staffLocale: string;
}) {
  return structured(
    AuditAiSchema,
    `Staff language: ${localeLabel(input.staffLocale)}
Page audited: ${input.url}

Extracted page data:
${JSON.stringify(input.page, null, 2).slice(0, 12000)}

Automated check results (id / severity / value):
${input.checks.map((c) => `- ${c.id} [${c.severity}] ${c.value ?? ""} ${c.params ? JSON.stringify(c.params) : ""}`).join("\n")}

Write a short executive summary for a marketing staff member, then a prioritised fix list (most impact for least effort first, max 10).
For title/meta problems, propose rewritten text in the page's language.`,
  );
}

// ---------------------------------------------------------------------------
// Sinh schema JSON-LD từ trang thật
// ---------------------------------------------------------------------------
const SchemaFromPageSchema = z.object({
  schema_type: z.string(),
  name: z.string(),
  json_ld: z.string().describe("A complete JSON-LD document as a JSON string, using @graph when several entities apply"),
  notes: z.string(),
});

export async function schemaFromPage(input: {
  url: string;
  locale: string;
  project: Project;
  pageText: string;
  staffLocale: string;
}) {
  const out = await structured(
    SchemaFromPageSchema,
    `Company: ${input.project.name} (${input.project.domain})
Page URL: ${input.url}
Content language: ${input.locale}
Staff language for notes: ${localeLabel(input.staffLocale)}

Page content (extracted text):
${input.pageText.slice(0, 15000)}

Generate the most appropriate schema.org JSON-LD for this B2B page (e.g. Organization, Service, Product, FAQPage, Article, BreadcrumbList, WebPage).
Use only facts present in the content or the company info above. Set "inLanguage" to "${input.locale}". Use absolute URLs.
In notes, list properties the staff should complete manually.`,
  );
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(out.json_ld);
  } catch {
    throw new Error("Claude trả về JSON-LD không hợp lệ, hãy thử lại");
  }
  return { ...out, json_ld: parsed };
}

// ---------------------------------------------------------------------------
// Đánh giá buyer + soạn lời chào kết nối LinkedIn
// ---------------------------------------------------------------------------
const LeadQualifySchema = z.object({
  leads: z.array(
    z.object({
      index: z.number().describe("The [n] index of the lead in the input list"),
      score: z.number().describe("0-100 fit as a buyer/importer/distributor of the product"),
      reason: z.string().describe("1-2 sentences in the staff language explaining the score"),
      message: z
        .string()
        .describe("Personalised LinkedIn connection note, max 280 characters, no emojis, no links"),
    }),
  ),
});

export interface LeadForAi {
  name: string | null;
  headline: string | null;
  company: string | null;
  location: string | null;
  about: string | null;
  experience: { title?: string; company?: string }[];
}

export async function qualifyLeads(input: {
  project: Project;
  product: string;
  leads: LeadForAi[];
  staffLocale: string;
  messageLanguage: string;
}) {
  const { project, product, leads } = input;
  const out = await structured(
    LeadQualifySchema,
    `We are ${project.name} (${project.domain}), a Vietnamese company. ${project.description ?? ""}
Product we want to sell: ${product}
Staff language for "reason": ${localeLabel(input.staffLocale)}
Language for "message": ${localeLabel(input.messageLanguage)}

Below are public LinkedIn profiles of potential buyers. For EACH profile:
- score 0-100: how likely this person can buy or influence buying ${product} from an overseas supplier (importer, distributor, wholesaler, retail/foodservice purchasing, sourcing, category management score high; unrelated roles score low).
- reason: why, citing their role/company.
- message: a short, respectful connection note from our sales staff. Mention something specific from their profile and the product; no hard sell, no invented facts, no prices or certifications we did not state, max 280 characters.

${leads
  .map(
    (l, i) => `[${i}] ${l.name ?? "?"} — ${l.headline ?? ""}
Company: ${l.company ?? "?"} · Location: ${l.location ?? "?"}
Experience: ${l.experience.map((e) => `${e.title ?? ""} @ ${e.company ?? ""}`).join("; ") || "n/a"}
About: ${(l.about ?? "").slice(0, 600)}`,
  )
  .join("\n\n")}`,
    "low",
  );
  return out.leads.map((l) => ({
    ...l,
    score: Math.max(0, Math.min(100, Math.round(l.score))),
    message: l.message.slice(0, 300),
  }));
}

// ---------------------------------------------------------------------------
// Báo cáo đánh giá SEO gửi khách (trước khi chốt dịch vụ)
// ---------------------------------------------------------------------------
const ReportNarrativeSchema = z.object({
  executive_summary: z
    .string()
    .describe("4-6 sentences for the client's CEO: current state, the biggest missed opportunity in export markets, what is at stake. Plain business language, no jargon."),
  health_summary: z.string().describe("2-3 sentences on website health based on the audited pages"),
  top_issues: z
    .array(
      z.object({
        title: z.string().describe("Short problem statement, e.g. 'Google không nhận diện được thương hiệu'"),
        impact: z.string().describe("1 sentence business impact. Say WHAT is wrong and why it matters — never HOW to fix it, no code"),
        severity: z.enum(["high", "medium", "low"]),
      }),
    )
    .describe("3-6 most important problems, most severe first"),
  intl_summary: z.string().describe("2-3 sentences on readiness for international buyers: language versions, hreflang, structured data"),
  keyword_summary: z.string().describe("2-3 sentences on keyword opportunities buyers in the target markets search for. Mention that difficulty is an estimate"),
  competitor_summary: z.string().describe("2-3 sentences on who currently occupies Google results for those searches"),
  ranking_summary: z.string().describe("1-2 sentences on current Google positions (often: not yet visible) as the starting point"),
  quick_wins: z
    .array(z.object({ title: z.string(), benefit: z.string().describe("1 sentence expected benefit") }))
    .describe("Exactly 3 quick wins achievable in the first month"),
  roadmap: z
    .array(
      z.object({
        period: z.string().describe("e.g. 'Tháng 1' / 'Month 1', 'Tháng 2–3'"),
        focus: z.string(),
        items: z.array(z.string()).describe("2-4 deliverables"),
      }),
    )
    .describe("3-4 phases covering 3-6 months"),
  closing: z.string().describe("2 sentences inviting the client to a consultation call; confident, not pushy"),
});
export type ReportNarrative = z.infer<typeof ReportNarrativeSchema>;

export async function writeReport(input: {
  provider: string;
  project: Project;
  locale: "vi" | "en";
  data: unknown;
}): Promise<ReportNarrative> {
  const { provider, project, locale, data } = input;
  return structured(
    ReportNarrativeSchema,
    `You are writing a free pre-sales SEO assessment that ${provider} (an international SEO & export-market consultancy) will send to a prospective client.
Goal: show clearly what is wrong, which export-market opportunities they are missing, and how ${provider} would help — so the client wants to sign.

Rules:
- Write everything in ${locale === "vi" ? "Vietnamese" : "English"}. Address the client as "${locale === "vi" ? "Quý công ty" : "your company"}"; refer to the consultancy as "${provider}".
- Business language for a CEO. Short sentences. No technical jargon without a plain explanation.
- Describe problems and opportunities, never step-by-step fixes or code (the fixes are part of the paid service).
- Use only the data below. Keyword difficulty is an AI estimate and search volumes are not available — do not invent numbers.
- If some data is missing (e.g. no keyword research or no rankings yet), say so briefly and turn it into a next step.

Client website: ${project.name} (${project.domain})
Industry: ${project.industry ?? "n/a"}
About: ${project.description ?? "n/a"}
Main country: ${countryName(project.country, "en")}; target markets: ${(project.markets ?? []).map((m) => countryName(m, "en")).join(", ") || "n/a"}

Assessment data (JSON):
${JSON.stringify(data)}`,
    "medium",
  );
}
