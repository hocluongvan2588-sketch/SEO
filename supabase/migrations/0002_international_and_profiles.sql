-- 0002: tự tạo profile khi thiếu + hỗ trợ đa thị trường quốc tế
-- Chạy sau 0001_init.sql (dán vào SQL Editor của Supabase).

-- =========================================================
-- 1. ensure_profile(): tạo profile cho user đang đăng nhập nếu chưa có
--    (trường hợp user được tạo trước khi chạy migration 0001).
--    Nếu hệ thống chưa có admin nào, user này trở thành admin.
-- =========================================================
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  result public.profiles;
  u auth.users;
begin
  select * into result from public.profiles where id = auth.uid();
  if found then
    return result;
  end if;

  select * into u from auth.users where id = auth.uid();
  if not found then
    return null;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
    case when exists (select 1 from public.profiles where role = 'admin') then 'editor'::public.staff_role
         else 'admin'::public.staff_role end
  )
  on conflict (id) do nothing
  returning * into result;

  if result.id is null then
    select * into result from public.profiles where id = auth.uid();
  end if;
  return result;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

-- Tạo profile cho mọi user cũ còn thiếu
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)), 'editor'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Nếu chưa có admin nào, user tạo sớm nhất thành admin
update public.profiles set role = 'admin'
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

-- =========================================================
-- 2. Đa thị trường: mỗi dự án có nhiều thị trường (quốc gia)
-- =========================================================
alter table public.projects add column if not exists markets text[] not null default array['vn'];
update public.projects set markets = array[country] where markets = array['vn'] and country <> 'vn';

-- Mỗi từ khóa gắn với một thị trường (cùng từ khóa ở US và UK là hai mục riêng)
alter table public.keywords add column if not exists country text;
update public.keywords k set country = p.country from public.projects p where k.project_id = p.id and k.country is null;
alter table public.keywords alter column country set not null;
alter table public.keywords alter column country set default 'vn';

alter table public.keywords drop constraint if exists keywords_project_id_keyword_locale_key;
alter table public.keywords drop constraint if exists keywords_project_keyword_locale_country_key;
alter table public.keywords add constraint keywords_project_keyword_locale_country_key
  unique (project_id, keyword, locale, country);
