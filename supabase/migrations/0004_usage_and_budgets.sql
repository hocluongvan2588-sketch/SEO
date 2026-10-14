-- 0004: theo dõi chi phí Claude / Bright Data + ngân sách tháng

-- Mỗi lần gọi dịch vụ trả phí (đã gom theo lượt thao tác của nhân viên)
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  provider text not null check (provider in ('claude', 'brightdata')),
  feature text not null,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  requests int not null default 0,
  cost_usd numeric(12, 6) not null default 0
);
create index usage_events_created_idx on public.usage_events (created_at desc);

-- Cấu hình chung (một dòng duy nhất)
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  claude_budget_usd numeric(10, 2) not null default 20,
  brightdata_budget_usd numeric(10, 2) not null default 10,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

alter table public.usage_events enable row level security;
alter table public.app_settings enable row level security;

-- Nhân viên được ghi chi phí của chính mình; chỉ Quản trị xem chi tiết
create policy "staff insert own usage" on public.usage_events for insert to authenticated
  with check (user_id = auth.uid());
create policy "admin read usage" on public.usage_events for select to authenticated
  using (public.current_role() = 'admin');

create policy "staff read settings" on public.app_settings for select to authenticated using (true);
create policy "admin update settings" on public.app_settings for update to authenticated
  using (public.current_role() = 'admin');

-- Tổng chi tháng này + ngân sách: mọi nhân viên đều xem được (để hiện cảnh báo),
-- nhưng không thấy chi tiết từng người.
create or replace function public.month_spend()
returns table (claude_usd numeric, brightdata_usd numeric, claude_budget_usd numeric, brightdata_budget_usd numeric)
language sql stable security definer set search_path = public
as $$
  select
    coalesce((select sum(cost_usd) from usage_events
              where provider = 'claude' and created_at >= date_trunc('month', now())), 0),
    coalesce((select sum(cost_usd) from usage_events
              where provider = 'brightdata' and created_at >= date_trunc('month', now())), 0),
    s.claude_budget_usd,
    s.brightdata_budget_usd
  from app_settings s where s.id = 1
$$;

grant select, insert on public.usage_events to authenticated;
grant select, update on public.app_settings to authenticated;
grant execute on function public.month_spend() to authenticated;
