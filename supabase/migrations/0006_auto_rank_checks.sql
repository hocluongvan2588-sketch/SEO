-- 0006: tự động kiểm tra thứ hạng theo lịch (Vercel Cron → /api/cron/rankings)

-- Bật/tắt tự động cho từng dự án (mặc định tắt)
alter table public.projects add column if not exists auto_rank_check boolean not null default false;

-- Thời điểm nội dung trang của từ khóa vừa đăng/cập nhật → 30 ngày sau đó kiểm tra 3 lần/tuần
alter table public.keywords add column if not exists content_updated_at timestamptz;

create or replace function public.mark_content_updated()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.content_updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists keywords_content_updated on public.keywords;
create trigger keywords_content_updated before insert or update of status on public.keywords
  for each row execute function public.mark_content_updated();

-- Nhật ký các lần chạy tự động
create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checked int not null default 0,
  found int not null default 0,
  skipped int not null default 0,
  remaining int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  note text
);
create index if not exists cron_runs_job_idx on public.cron_runs (job, started_at desc);
alter table public.cron_runs enable row level security;
drop policy if exists "staff read cron runs" on public.cron_runs;
create policy "staff read cron runs" on public.cron_runs for select to authenticated using (true);
grant select on public.cron_runs to authenticated;

-- Cron chạy bằng service role (không có người đăng nhập) → cấp quyền rõ ràng
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
