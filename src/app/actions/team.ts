"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/context";
import { getSession } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export async function updateMemberRole(id: string, role: StaffRole): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (session?.profile?.role !== "admin") throw new Error("Admin only");
    if (role !== "admin") {
      // Luôn phải còn ít nhất một Quản trị, tránh tự khóa hệ thống
      const { count } = await session.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").neq("id", id);
      if (!count) throw new Error("Phải còn ít nhất một Quản trị. Hãy cấp quyền Quản trị cho người khác trước.");
    }
    const { error } = await session.supabase.from("profiles").update({ role }).eq("id", id);
    if (error) throw error;
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMyName(fullName: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", session.user.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

/** Cập nhật thông tin của chính mình (tên, chức danh, điện thoại — dùng trên báo cáo gửi khách). */
export async function updateMyProfile(input: { fullName: string; jobTitle: string; phone: string }): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase
      .from("profiles")
      .update({
        full_name: input.fullName.trim(),
        job_title: input.jobTitle.trim() || null,
        phone: input.phone.trim() || null,
      })
      .eq("id", session.user.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
