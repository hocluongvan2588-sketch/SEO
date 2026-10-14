-- 0003: cấp quyền bảng cho người dùng đã đăng nhập.
-- Project Supabase mới không còn tự cấp quyền cho bảng tạo bằng SQL,
-- dẫn tới lỗi 42501 "permission denied for table ...".
-- Quyền thực tế vẫn do Row Level Security (migration 0001) kiểm soát.
-- Không cấp gì cho role "anon": khách chưa đăng nhập không truy cập được dữ liệu.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.projects,
  public.keyword_research,
  public.keywords,
  public.rank_checks,
  public.audits,
  public.schemas
to authenticated;

grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.can_write() to authenticated;
grant execute on function public.current_role() to authenticated;

-- Bảng tạo sau này trong schema public cũng tự có quyền tương tự
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
