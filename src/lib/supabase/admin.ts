import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Client service role — chỉ dùng cho tác vụ nền (cron), bỏ qua RLS. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Thiếu biến môi trường SUPABASE_SERVICE_ROLE_KEY");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
