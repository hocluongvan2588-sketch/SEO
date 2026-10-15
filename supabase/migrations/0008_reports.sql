-- 0008: báo cáo đánh giá SEO gửi khách (PDF) + thông tin liên hệ của nhân viên

-- Thông tin liên hệ hiện trên báo cáo (người phụ trách = người tạo báo cáo)
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists phone text;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  locale text not null default 'vi' check (locale in ('vi', 'en')),
  sections text[] not null default '{}',
  -- Ảnh chụp dữ liệu lúc tạo (audit, từ khóa, thứ hạng, đối thủ) → báo cáo không đổi khi dữ liệu thay đổi
  data jsonb not null default '{}',
  -- Nội dung AI viết (tóm tắt, vấn đề chính, lộ trình…)
  ai jsonb not null default '{}',
  -- Người phụ trách (chụp lại lúc tạo)
  contact jsonb not null default '{}',
  valid_until date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reports_project_idx on public.reports (project_id, created_at desc);

alter table public.reports enable row level security;
drop policy if exists "staff read reports" on public.reports;
drop policy if exists "writers manage reports" on public.reports;
create policy "staff read reports" on public.reports for select to authenticated using (true);
create policy "writers manage reports" on public.reports for all to authenticated
  using (public.can_write()) with check (public.can_write());

grant select, insert, update, delete on public.reports to authenticated;
grant select, insert, update, delete on public.reports to service_role;
