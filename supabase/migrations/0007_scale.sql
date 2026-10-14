-- 0007: chạy ổn khi có nhiều dự án / nhiều từ khóa
-- Supabase chỉ trả tối đa 1.000 dòng mỗi lần đọc → thống kê, lịch sử, tổng chi phí tính ngay trong database.

-- Thống kê từ khóa của một dự án (trang Tổng quan, Thứ hạng)
create or replace function public.keyword_stats(p_project uuid)
returns table (
  total int, tracked int, top3 int, top10 int, top30 int, fresh int,
  n_new int, n_planned int, n_writing int, n_published int, n_ignored int
)
language sql stable set search_path = public
as $$
  select
    count(*)::int,
    count(*) filter (where status <> 'ignored' and last_checked_at is not null)::int,
    count(*) filter (where status <> 'ignored' and current_position <= 3)::int,
    count(*) filter (where status <> 'ignored' and current_position <= 10)::int,
    count(*) filter (where status <> 'ignored' and current_position is not null)::int,
    count(*) filter (where status = 'published' and content_updated_at > now() - interval '30 days')::int,
    count(*) filter (where status = 'new')::int,
    count(*) filter (where status = 'planned')::int,
    count(*) filter (where status = 'writing')::int,
    count(*) filter (where status = 'published')::int,
    count(*) filter (where status = 'ignored')::int
  from keywords where project_id = p_project
$$;

-- Giá trị dùng cho bộ lọc (thị trường, cụm) của một dự án
create or replace function public.keyword_facets(p_project uuid)
returns table (countries text[], clusters text[])
language sql stable set search_path = public
as $$
  select
    coalesce(array(select distinct country from keywords where project_id = p_project and country is not null order by 1), '{}'),
    coalesce(array(select distinct cluster from keywords where project_id = p_project and cluster is not null order by 1), '{}')
$$;

-- N lần kiểm tra gần nhất của từng từ khóa (mới nhất trước) — gửi danh sách id trong body, không giới hạn độ dài URL
create or replace function public.rank_history(p_keyword_ids uuid[], p_limit int default 10)
returns table (keyword_id uuid, positions int[])
language sql stable set search_path = public
as $$
  select k.id,
    coalesce(array(select rc.position from rank_checks rc where rc.keyword_id = k.id order by rc.checked_at desc limit p_limit), '{}')
  from unnest(p_keyword_ids) as k (id)
$$;

-- Tổng chi phí từ một thời điểm, gom theo chức năng / nhân viên / dự án (trang Chi phí, chỉ Quản trị đọc được do RLS)
create or replace function public.usage_summary(p_from timestamptz)
returns table (dim text, key text, provider text, cost_usd numeric, requests bigint)
language sql stable set search_path = public
as $$
  select 'feature', feature, provider, sum(cost_usd), sum(requests) from usage_events where created_at >= p_from group by 2, 3
  union all
  select 'user', coalesce(user_id::text, 'auto'), provider, sum(cost_usd), sum(requests) from usage_events where created_at >= p_from group by 2, 3
  union all
  select 'project', coalesce(project_id::text, 'none'), provider, sum(cost_usd), sum(requests) from usage_events where created_at >= p_from group by 2, 3
$$;

-- Ngân sách riêng từng dự án (USD/tháng, Claude + Bright Data). null = không giới hạn riêng
alter table public.projects add column if not exists monthly_budget_usd numeric(10, 2);

-- Chi phí tháng này của một dự án: mọi nhân viên gọi được (để chặn khi vượt ngân sách dự án)
create or replace function public.project_month_spend(p_project uuid)
returns table (spent_usd numeric, budget_usd numeric)
language sql stable security definer set search_path = public
as $$
  select
    coalesce((select sum(cost_usd) from usage_events
              where project_id = p_project and created_at >= date_trunc('month', now())), 0),
    (select monthly_budget_usd from projects where id = p_project)
$$;

create index if not exists keywords_project_status_idx on public.keywords (project_id, status);
create index if not exists keywords_project_position_idx on public.keywords (project_id, current_position);
create index if not exists usage_events_project_idx on public.usage_events (project_id, created_at desc);

grant execute on function public.keyword_stats(uuid) to authenticated, service_role;
grant execute on function public.keyword_facets(uuid) to authenticated, service_role;
grant execute on function public.rank_history(uuid[], int) to authenticated, service_role;
grant execute on function public.usage_summary(timestamptz) to authenticated, service_role;
grant execute on function public.project_month_spend(uuid) to authenticated, service_role;
