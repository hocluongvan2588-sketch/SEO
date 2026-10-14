-- SEO Hub — schema khởi tạo
-- Chạy bằng: supabase db push  (hoặc dán vào SQL Editor của Supabase)

create extension if not exists "pgcrypto";

-- =========================================================
-- Profiles (nhân viên nội bộ)
-- =========================================================
create type public.staff_role as enum ('admin', 'editor', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.staff_role not null default 'editor',
  ui_locale text not null default 'vi',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    -- Người dùng đầu tiên trở thành admin
    case when exists (select 1 from public.profiles) then 'editor'::public.staff_role
         else 'admin'::public.staff_role end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_role()
returns public.staff_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.can_write()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() in ('admin', 'editor'), false) $$;

-- =========================================================
-- Projects (website của doanh nghiệp)
-- =========================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  description text,
  industry text,
  default_locale text not null default 'vi',
  locales text[] not null default array['vi'],
  country text not null default 'vn',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- Keyword research (mỗi lần nghiên cứu từ khóa)
-- =========================================================
create table public.keyword_research (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  seed text not null,
  locale text not null,
  country text not null,
  serp jsonb,
  ai jsonb,
  status text not null default 'done',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  research_id uuid references public.keyword_research (id) on delete set null,
  keyword text not null,
  locale text not null,
  intent text,
  difficulty int check (difficulty between 0 and 100),
  priority text check (priority in ('high', 'medium', 'low')),
  cluster text,
  content_type text,
  status text not null default 'new' check (status in ('new', 'planned', 'writing', 'published', 'ignored')),
  target_url text,
  current_position int,
  best_position int,
  last_checked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, keyword, locale)
);
create index keywords_project_idx on public.keywords (project_id);

create table public.rank_checks (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  position int,
  url text,
  checked_at timestamptz not null default now()
);
create index rank_checks_keyword_idx on public.rank_checks (keyword_id, checked_at desc);

-- =========================================================
-- SEO audits
-- =========================================================
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  url text not null,
  score int,
  checks jsonb not null default '[]'::jsonb,
  page jsonb,
  ai jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index audits_project_idx on public.audits (project_id, created_at desc);

-- =========================================================
-- Schema markup (JSON-LD B2B)
-- =========================================================
create table public.schemas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  schema_type text not null,
  locale text not null,
  input jsonb,
  json_ld jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- updated_at trigger
-- =========================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger keywords_touch before update on public.keywords
  for each row execute function public.touch_updated_at();

-- =========================================================
-- Row Level Security — hệ thống nội bộ:
--   mọi nhân viên đăng nhập đều xem được,
--   admin/editor được ghi, chỉ admin được xóa project.
-- =========================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.keyword_research enable row level security;
alter table public.keywords enable row level security;
alter table public.rank_checks enable row level security;
alter table public.audits enable row level security;
alter table public.schemas enable row level security;

create policy "staff read profiles" on public.profiles for select to authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role());
create policy "admin manages profiles" on public.profiles for update to authenticated
  using (public.current_role() = 'admin');

do $$
declare t text;
begin
  foreach t in array array['projects', 'keyword_research', 'keywords', 'rank_checks', 'audits', 'schemas'] loop
    execute format('create policy "staff read" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "writers insert" on public.%I for insert to authenticated with check (public.can_write())', t);
    execute format('create policy "writers update" on public.%I for update to authenticated using (public.can_write())', t);
  end loop;
  foreach t in array array['keyword_research', 'keywords', 'rank_checks', 'audits', 'schemas'] loop
    execute format('create policy "writers delete" on public.%I for delete to authenticated using (public.can_write())', t);
  end loop;
end $$;

create policy "admin delete projects" on public.projects for delete to authenticated
  using (public.current_role() = 'admin');
