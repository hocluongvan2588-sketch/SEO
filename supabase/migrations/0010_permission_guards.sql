-- 0010: chốt chặn phân quyền ở database

-- Chỉ Quản trị được đổi ngân sách riêng của dự án (Biên tập vẫn sửa được thông tin dự án khác)
create or replace function public.guard_project_budget()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.monthly_budget_usd is distinct from old.monthly_budget_usd
     and auth.uid() is not null and public.current_role() <> 'admin' then
    raise exception 'Chỉ Quản trị được đổi ngân sách dự án';
  end if;
  return new;
end $$;
drop trigger if exists projects_budget_guard on public.projects;
create trigger projects_budget_guard before update of monthly_budget_usd on public.projects
  for each row execute function public.guard_project_budget();
