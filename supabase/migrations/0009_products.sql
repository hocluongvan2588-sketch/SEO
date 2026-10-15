-- 0009: danh mục sản phẩm của dự án + lịch sử quét website

create table if not exists public.project_products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  category text,
  details text,
  certifications text[] not null default '{}',
  -- manual = nhân viên nhập; website = lấy từ website khách (có trích dẫn nguồn)
  source text not null default 'manual' check (source in ('manual', 'website')),
  source_url text,
  evidence text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_products_project_idx on public.project_products (project_id, created_at);

create table if not exists public.site_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  url text not null,
  -- Các trang đã đọc + dữ kiện máy đo được (ngôn ngữ, hreflang)
  pages jsonb not null default '[]',
  facts jsonb not null default '{}',
  -- Kết quả AI sau khi hệ thống đã đối chiếu trích dẫn với nội dung trang thật
  result jsonb not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists site_scans_project_idx on public.site_scans (project_id, created_at desc);

alter table public.project_products enable row level security;
alter table public.site_scans enable row level security;
drop policy if exists "staff read products" on public.project_products;
drop policy if exists "writers manage products" on public.project_products;
drop policy if exists "staff read scans" on public.site_scans;
drop policy if exists "writers manage scans" on public.site_scans;
create policy "staff read products" on public.project_products for select to authenticated using (true);
create policy "writers manage products" on public.project_products for all to authenticated
  using (public.can_write()) with check (public.can_write());
create policy "staff read scans" on public.site_scans for select to authenticated using (true);
create policy "writers manage scans" on public.site_scans for all to authenticated
  using (public.can_write()) with check (public.can_write());

grant select, insert, update, delete on public.project_products, public.site_scans to authenticated, service_role;
