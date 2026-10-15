import { createTranslator } from "next-intl";
import { BRAND } from "@/lib/brand";
import { countryName, flag } from "@/lib/locales";
import type { ReportRecord } from "@/lib/types";
import vi from "../../../../../messages/vi.json";
import en from "../../../../../messages/en.json";

/** Nhãn cố định của báo cáo — theo ngôn ngữ báo cáo, không theo ngôn ngữ giao diện của nhân viên */
const L = {
  vi: {
    title: "Báo cáo đánh giá SEO",
    subtitle: "Đánh giá hiện trạng & cơ hội trên Google tại thị trường xuất khẩu",
    date: "Ngày lập",
    validUntil: "Hiệu lực đến",
    preparedFor: "Dành cho",
    summary: "Tóm tắt",
    avgScore: "Điểm SEO trung bình",
    pages: "Trang đã kiểm tra",
    critical: "Lỗi nghiêm trọng",
    top10: "Từ khóa trong Top 10",
    issues: "Những vấn đề chính",
    sev: { high: "Nghiêm trọng", medium: "Trung bình", low: "Thấp" },
    health: "Sức khỏe website",
    page: "Trang",
    score: "Điểm",
    errors: "Lỗi",
    warnings: "Cảnh báo",
    mainProblems: "Vấn đề tiêu biểu",
    international: "Sẵn sàng cho thị trường quốc tế",
    intlChecks: {
      english: "Có phiên bản tiếng Anh cho khách nước ngoài",
      hreflang: "Khai báo ngôn ngữ/quốc gia cho Google (hreflang)",
      schema: "Dữ liệu doanh nghiệp có cấu trúc (schema)",
      lang: "Khai báo ngôn ngữ trang",
    },
    keywords: "Cơ hội từ khóa",
    keyword: "Từ khóa",
    market: "Thị trường",
    intent: "Mục đích tìm kiếm",
    difficulty: "Độ khó (ước tính)",
    priority: "Ưu tiên",
    estimateNote: "Độ khó do AI ước tính từ kết quả Google thực tế; chưa bao gồm lượng tìm kiếm hằng tháng.",
    competitors: "Đối thủ đang chiếm vị trí",
    domain: "Website",
    appearances: "Số lần xuất hiện",
    bestRank: "Vị trí cao nhất",
    researched: "Dựa trên kết quả Google cho",
    rankings: "Vị trí hiện tại trên Google",
    tracked: "Từ khóa đã kiểm tra",
    notRanked: "Chưa có từ khóa nào trong Top 30 — đây là điểm xuất phát.",
    roadmap: "Lộ trình đề xuất",
    quickWins: "3 việc làm nhanh trong tháng đầu",
    nextStep: "Bước tiếp theo",
    contact: "Người phụ trách",
    footer: "Báo cáo được lập bằng nền tảng",
    none: "Chưa có dữ liệu",
  },
  en: {
    title: "SEO Assessment Report",
    subtitle: "Current state & Google opportunities in export markets",
    date: "Date",
    validUntil: "Valid until",
    preparedFor: "Prepared for",
    summary: "Executive summary",
    avgScore: "Average SEO score",
    pages: "Pages assessed",
    critical: "Critical issues",
    top10: "Keywords in Top 10",
    issues: "Key issues",
    sev: { high: "High", medium: "Medium", low: "Low" },
    health: "Website health",
    page: "Page",
    score: "Score",
    errors: "Errors",
    warnings: "Warnings",
    mainProblems: "Typical problems",
    international: "International readiness",
    intlChecks: {
      english: "English version for foreign buyers",
      hreflang: "Language/country targeting for Google (hreflang)",
      schema: "Structured business data (schema)",
      lang: "Page language declared",
    },
    keywords: "Keyword opportunities",
    keyword: "Keyword",
    market: "Market",
    intent: "Search intent",
    difficulty: "Difficulty (est.)",
    priority: "Priority",
    estimateNote: "Difficulty is estimated by AI from live Google results; monthly search volume is not included.",
    competitors: "Who ranks instead of you",
    domain: "Website",
    appearances: "Appearances",
    bestRank: "Best position",
    researched: "Based on Google results for",
    rankings: "Current Google positions",
    tracked: "Keywords checked",
    notRanked: "No keyword ranks in the Top 30 yet — this is the starting point.",
    roadmap: "Proposed roadmap",
    quickWins: "3 quick wins in month one",
    nextStep: "Next step",
    contact: "Your contact",
    footer: "Report produced with",
    none: "No data yet",
  },
};

const SEV_STYLE = {
  high: "bg-[#fde8e8] text-[#b42318]",
  medium: "bg-[#fef3c7] text-[#92400e]",
  low: "bg-[#e0ecff] text-[#1d4ed8]",
};

function scoreColor(score: number | null) {
  if (score == null) return "text-[#64748b]";
  return score >= 80 ? "text-[#15803d]" : score >= 50 ? "text-[#b45309]" : "text-[#b42318]";
}

const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname.replace(/^www\./, "") : u.pathname;
  } catch {
    return url;
  }
};

export function ReportDocument({ report }: { report: ReportRecord }) {
  const loc = report.locale;
  const l = L[loc];
  const messages = loc === "vi" ? vi : en;
  // Khóa động (id kiểm tra, intent…) → dùng chữ ký đơn giản
  type Tr = (key: string, values?: Record<string, string | number>) => string;
  const tc = createTranslator({ locale: loc, messages, namespace: "checks" }) as unknown as Tr;
  const tk = createTranslator({ locale: loc, messages, namespace: "keywords" }) as unknown as Tr;
  const { data, ai, contact } = report;
  const has = (s: string) => report.sections.includes(s);
  const fmtDate = (d: string) => new Intl.DateTimeFormat(loc === "vi" ? "vi-VN" : "en-GB", { dateStyle: "long" }).format(new Date(d));

  const scored = data.audits.filter((a) => a.score != null);
  const avg = scored.length ? Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length) : null;
  const critical = data.audits.reduce((s, a) => s + a.errors, 0);

  const intl = {
    english: data.project.locales.includes("en") || data.audits.some((a) => a.lang?.startsWith("en")),
    hreflang: data.audits.some((a) => a.hreflang > 0),
    schema: data.audits.some((a) => a.schemaTypes.length > 0),
    lang: data.audits.length > 0 && data.audits.every((a) => !!a.lang),
  };

  let n = 0;
  const num = () => ++n;

  return (
    <article className="report-doc mx-auto w-full max-w-[210mm] bg-white text-[13px] leading-relaxed text-[#1e293b] shadow-xl ring-1 ring-black/5">
      {/* Bìa */}
      <header className="bg-[#0f2a5c] px-10 py-8 text-white">
        <div className="flex items-start justify-between gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logoWhite} alt={BRAND.company} className="h-20 w-auto" />
          <div className="text-right text-xs text-white/75">
            <div>
              {l.date}: {fmtDate(report.created_at)}
            </div>
            {report.valid_until && (
              <div>
                {l.validUntil}: {fmtDate(report.valid_until)}
              </div>
            )}
            <div className="mt-1 text-white/60">{BRAND.website}</div>
          </div>
        </div>
        <h1 className="mt-8 text-3xl font-bold tracking-tight">{l.title}</h1>
        <p className="mt-1 text-white/80">{l.subtitle}</p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm">
          <span className="text-white/70">{l.preparedFor}:</span>
          <span className="font-semibold">{data.project.name}</span>
          <span className="text-white/60">· {data.project.domain}</span>
        </div>
      </header>

      <div className="space-y-9 px-10 py-9">
        {/* 1. Tóm tắt */}
        <Section n={num()} title={l.summary}>
          <p className="text-[14px]">{ai.executive_summary}</p>
          <div className="mt-5 grid grid-cols-4 gap-3">
            <Kpi label={l.avgScore} value={avg ?? "—"} className={scoreColor(avg)} />
            <Kpi label={l.pages} value={data.audits.length} />
            <Kpi label={l.critical} value={critical} className={critical ? "text-[#b42318]" : undefined} />
            <Kpi label={l.top10} value={data.rankings.top10} />
          </div>
          {ai.top_issues.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 font-semibold text-[#0f2a5c]">{l.issues}</h3>
              <ul className="space-y-2">
                {ai.top_issues.map((x, i) => (
                  <li key={i} className="flex gap-3 rounded-lg border border-[#e2e8f0] p-3 [break-inside:avoid]">
                    <span className={`h-fit shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${SEV_STYLE[x.severity]}`}>
                      {l.sev[x.severity]}
                    </span>
                    <div>
                      <div className="font-medium text-[#0f172a]">{x.title}</div>
                      <div className="text-[#475569]">{x.impact}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        {has("health") && (
          <Section n={num()} title={l.health}>
            <p>{ai.health_summary}</p>
            {data.audits.length ? (
              <table className="mt-4 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-[#0f2a5c] text-[11px] uppercase tracking-wide text-[#64748b]">
                    <th className="py-2 pr-3">{l.page}</th>
                    <th className="px-3 py-2 text-center">{l.score}</th>
                    <th className="px-3 py-2 text-center">{l.errors}</th>
                    <th className="px-3 py-2 text-center">{l.warnings}</th>
                    <th className="py-2 pl-3">{l.mainProblems}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audits.map((a) => (
                    <tr key={a.url} className="border-b border-[#e2e8f0] align-top [break-inside:avoid]">
                      <td className="max-w-[48mm] break-words py-2.5 pr-3 font-medium">{pathOf(a.url)}</td>
                      <td className={`px-3 py-2.5 text-center text-base font-bold ${scoreColor(a.score)}`}>{a.score ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center">{a.errors}</td>
                      <td className="px-3 py-2.5 text-center">{a.warnings}</td>
                      <td className="py-2.5 pl-3 text-[12px] text-[#475569]">
                        {[...a.issues]
                          .sort((x, y) => (x.severity === "error" ? -1 : 0) - (y.severity === "error" ? -1 : 0))
                          .slice(0, 3)
                          .map((i) => safe(() => tc(i.id, { ...(i.params ?? {}) }), i.id))
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text={l.none} />
            )}
          </Section>
        )}

        {has("international") && (
          <Section n={num()} title={l.international}>
            <p>{ai.intl_summary}</p>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {(Object.keys(intl) as (keyof typeof intl)[]).map((k) => (
                <li key={k} className="flex items-center gap-2.5 rounded-lg border border-[#e2e8f0] px-3 py-2.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${intl[k] ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}
                  >
                    {intl[k] ? "✓" : "✕"}
                  </span>
                  {l.intlChecks[k]}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {has("keywords") && (
          <Section n={num()} title={l.keywords}>
            <p>{ai.keyword_summary}</p>
            {data.keywords.length ? (
              <>
                <table className="mt-4 w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b-2 border-[#0f2a5c] text-[11px] uppercase tracking-wide text-[#64748b]">
                      <th className="py-2 pr-3">{l.keyword}</th>
                      <th className="px-3 py-2">{l.market}</th>
                      <th className="px-3 py-2">{l.intent}</th>
                      <th className="px-3 py-2 text-center">{l.difficulty}</th>
                      <th className="py-2 pl-3">{l.priority}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.keywords.map((k) => (
                      <tr key={`${k.keyword}-${k.country}-${k.locale}`} className="border-b border-[#e2e8f0] [break-inside:avoid]">
                        <td className="py-2 pr-3 font-medium">{k.keyword}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {flag(k.country)} {countryName(k.country, loc)}
                        </td>
                        <td className="px-3 py-2">{k.intent ? safe(() => tk(`intent.${k.intent}`), k.intent) : "—"}</td>
                        <td className="px-3 py-2 text-center">{k.difficulty ?? "—"}</td>
                        <td className="py-2 pl-3">{k.priority ? safe(() => tk(`priority.${k.priority}`), k.priority) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] italic text-[#64748b]">{l.estimateNote}</p>
              </>
            ) : (
              <Empty text={l.none} />
            )}
          </Section>
        )}

        {has("competitors") && (
          <Section n={num()} title={l.competitors}>
            <p>{ai.competitor_summary}</p>
            {data.competitors.length ? (
              <>
                <table className="mt-4 w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b-2 border-[#0f2a5c] text-[11px] uppercase tracking-wide text-[#64748b]">
                      <th className="py-2 pr-3">{l.domain}</th>
                      <th className="px-3 py-2 text-center">{l.appearances}</th>
                      <th className="py-2 pl-3 text-center">{l.bestRank}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.competitors.map((c) => (
                      <tr key={c.domain} className="border-b border-[#e2e8f0]">
                        <td className="py-2 pr-3 font-medium">{c.domain}</td>
                        <td className="px-3 py-2 text-center">{c.appearances}</td>
                        <td className="py-2 pl-3 text-center">#{c.bestRank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.researchQueries.length > 0 && (
                  <p className="mt-2 text-[11px] italic text-[#64748b]">
                    {l.researched}: {data.researchQueries.map((q) => `“${q}”`).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <Empty text={l.none} />
            )}
          </Section>
        )}

        {has("rankings") && (
          <Section n={num()} title={l.rankings}>
            <p>{ai.ranking_summary}</p>
            <div className="mt-4 grid grid-cols-4 gap-3">
              <Kpi label={l.tracked} value={data.rankings.tracked} />
              <Kpi label="Top 3" value={data.rankings.top3} />
              <Kpi label="Top 10" value={data.rankings.top10} />
              <Kpi label="Top 30" value={data.rankings.top30} />
            </div>
            {data.rankings.best.length ? (
              <ul className="mt-3 divide-y divide-[#e2e8f0] rounded-lg border border-[#e2e8f0]">
                {data.rankings.best.map((r) => (
                  <li key={`${r.keyword}-${r.country}`} className="flex items-center justify-between px-3 py-2">
                    <span>
                      {r.keyword} <span className="text-[#64748b]">· {flag(r.country)}</span>
                    </span>
                    <span className="font-semibold text-[#0f2a5c]">#{r.position}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg bg-[#f1f5f9] px-3 py-2.5 text-[#475569]">{l.notRanked}</p>
            )}
          </Section>
        )}

        {has("roadmap") && (
          <Section n={num()} title={l.roadmap}>
            <h3 className="mb-2 font-semibold text-[#0f2a5c]">{l.quickWins}</h3>
            <div className="grid grid-cols-3 gap-3">
              {ai.quick_wins.slice(0, 3).map((w, i) => (
                <div key={i} className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-3 [break-inside:avoid]">
                  <div className="text-[11px] font-bold text-[#2563eb]">0{i + 1}</div>
                  <div className="mt-1 font-semibold text-[#0f172a]">{w.title}</div>
                  <div className="mt-1 text-[12px] text-[#475569]">{w.benefit}</div>
                </div>
              ))}
            </div>
            <ol className="mt-6 space-y-0">
              {ai.roadmap.map((p, i) => (
                <li key={i} className="relative flex gap-4 pb-5 [break-inside:avoid] last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0f2a5c] text-[12px] font-bold text-white">
                      {i + 1}
                    </span>
                    {i < ai.roadmap.length - 1 && <span className="mt-1 w-px flex-1 bg-[#cbd5e1]" />}
                  </div>
                  <div className="pb-1">
                    <div className="font-semibold text-[#0f172a]">
                      {p.period} — {p.focus}
                    </div>
                    <ul className="mt-1 list-disc pl-5 text-[#475569]">
                      {p.items.map((it, j) => (
                        <li key={j}>{it}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Bước tiếp theo + người phụ trách */}
        <section className="rounded-xl bg-[#0f2a5c] p-6 text-white [break-inside:avoid]">
          <h2 className="text-lg font-semibold">{l.nextStep}</h2>
          <p className="mt-1 text-white/85">{ai.closing}</p>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-white/15 pt-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-white/60">{l.contact}</div>
              <div className="mt-1 text-base font-semibold">{contact.name}</div>
              {contact.title && <div className="text-white/80">{contact.title}</div>}
            </div>
            <div className="text-right text-white/90">
              {contact.phone && <div>{contact.phone}</div>}
              <div>{contact.email}</div>
              <div>{BRAND.website}</div>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-[#e2e8f0] px-10 py-4 text-center text-[11px] text-[#94a3b8]">
        {l.footer} {BRAND.name} · {BRAND.company}
      </footer>
    </article>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-3 border-b border-[#e2e8f0] pb-2 text-xl font-bold tracking-tight text-[#0f2a5c] [break-after:avoid]">
        <span className="text-[#2563eb]">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="rounded-lg bg-[#f1f5f9] p-3 [break-inside:avoid]">
      <div className={`text-2xl font-bold text-[#0f2a5c] ${className ?? ""}`}>{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-[#64748b]">{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mt-3 rounded-lg bg-[#f1f5f9] px-3 py-2.5 text-[#64748b]">{text}</p>;
}

/** Thông điệp kiểm tra không có bản dịch (vd. id mới) → hiện id thay vì lỗi */
function safe(fn: () => string, fallback: string) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
