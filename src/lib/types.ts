export type StaffRole = "admin" | "editor" | "viewer";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: StaffRole;
  ui_locale: string;
  /** Chức danh, số điện thoại — hiện trên báo cáo gửi khách (migration 0008) */
  job_title?: string | null;
  phone?: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  industry: string | null;
  default_locale: string;
  locales: string[];
  country: string;
  /** Các thị trường (mã quốc gia) mục tiêu */
  markets: string[];
  /** Tự động kiểm tra thứ hạng theo lịch (migration 0006) */
  auto_rank_check?: boolean;
  created_at: string;
}

export type KeywordStatus = "new" | "planned" | "writing" | "published" | "ignored";
export type Priority = "high" | "medium" | "low";

export interface Keyword {
  id: string;
  project_id: string;
  research_id: string | null;
  keyword: string;
  locale: string;
  country: string;
  intent: string | null;
  difficulty: number | null;
  priority: Priority | null;
  cluster: string | null;
  content_type: string | null;
  status: KeywordStatus;
  target_url: string | null;
  current_position: number | null;
  best_position: number | null;
  last_checked_at: string | null;
  /** Lần đăng/cập nhật nội dung gần nhất (migration 0006) */
  content_updated_at?: string | null;
  notes: string | null;
  created_at: string;
}

export type CheckSeverity = "error" | "warning" | "pass" | "info";

export interface AuditCheck {
  id: string;
  category: "meta" | "content" | "technical" | "international" | "structured-data" | "links" | "images";
  severity: CheckSeverity;
  value?: string;
  /** Tham số cho thông điệp i18n */
  params?: Record<string, string | number>;
}

export interface Audit {
  id: string;
  project_id: string;
  url: string;
  score: number | null;
  checks: AuditCheck[];
  page: Record<string, unknown> | null;
  ai: AuditAi | null;
  created_at: string;
}

export interface AuditAi {
  summary: string;
  fixes: { title: string; detail: string; impact: Priority; effort: Priority }[];
}

export type LeadStatus = "new" | "connected" | "messaged" | "replied" | "opportunity" | "not_fit";

export interface Lead {
  id: string;
  project_id: string;
  linkedin_url: string;
  name: string | null;
  headline: string | null;
  company: string | null;
  company_url: string | null;
  location: string | null;
  country_code: string | null;
  about: string | null;
  experience: { title?: string; company?: string; duration?: string }[];
  avatar_url: string | null;
  product: string | null;
  source: "search" | "manual";
  search_query: string | null;
  status: LeadStatus;
  owner_id: string | null;
  notes: string | null;
  ai_score: number | null;
  ai_reason: string | null;
  ai_message: string | null;
  collected_at: string;
  expires_at: string;
  created_at: string;
}

export interface SchemaRecord {
  id: string;
  project_id: string;
  name: string;
  schema_type: string;
  locale: string;
  input: Record<string, unknown> | null;
  json_ld: Record<string, unknown>;
  created_at: string;
}

export interface ReportRecord {
  id: string;
  project_id: string;
  title: string;
  locale: "vi" | "en";
  sections: string[];
  data: import("./report-data").ReportData;
  ai: import("./ai").ReportNarrative;
  contact: { name: string; email: string; title: string | null; phone: string | null };
  valid_until: string | null;
  created_by: string | null;
  created_at: string;
}
