-- 0005: Khách hàng tiềm năng (buyer) từ hồ sơ LinkedIn công khai
-- Chỉ lưu các trường phục vụ chào hàng; tự xóa sau 12 tháng (expires_at).

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  linkedin_url text not null,
  name text,
  headline text,
  company text,
  company_url text,
  location text,
  country_code text,
  about text,
  experience jsonb not null default '[]'::jsonb,
  avatar_url text,
  product text,
  source text not null default 'manual' check (source in ('search', 'manual')),
  search_query text,
  status text not null default 'new'
    check (status in ('new', 'connected', 'messaged', 'replied', 'opportunity', 'not_fit')),
  owner_id uuid references public.profiles (id) on delete set null,
  notes text,
  ai_score int check (ai_score between 0 and 100),
  ai_reason text,
  ai_message text,
  collected_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 months',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, linkedin_url)
);
create index leads_project_idx on public.leads (project_id, created_at desc);

create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

alter table public.leads enable row level security;
create policy "staff read" on public.leads for select to authenticated using (true);
create policy "writers insert" on public.leads for insert to authenticated with check (public.can_write());
create policy "writers update" on public.leads for update to authenticated using (public.can_write());
create policy "writers delete" on public.leads for delete to authenticated using (public.can_write());

-- Xóa hồ sơ đã quá hạn lưu trữ (gọi mỗi khi mở trang Khách hàng)
create or replace function public.purge_expired_leads()
returns int
language sql volatile security definer set search_path = public
as $$
  with gone as (delete from leads where expires_at < now() returning 1)
  select count(*)::int from gone
$$;

grant select, insert, update, delete on public.leads to authenticated;
grant execute on function public.purge_expired_leads() to authenticated;
