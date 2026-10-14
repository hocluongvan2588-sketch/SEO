import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Profile } from "@/lib/types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Gọi từ Server Component: middleware sẽ làm mới session.
          }
        },
      },
    },
  );
}

/** Trả về user + profile hiện tại, hoặc null nếu chưa đăng nhập. */
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  let { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    // User tạo trước khi có trigger → tự tạo profile (migration 0002)
    const { data, error } = await supabase.rpc("ensure_profile");
    if (error) console.error("ensure_profile failed:", error.message);
    profile = data && (data as { id?: string }).id ? data : null;
  }
  return { supabase, user, profile: profile as Profile | null };
}
