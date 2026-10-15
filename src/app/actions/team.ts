"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/context";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
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

const StaffInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(1).max(100),
  role: z.enum(["admin", "editor", "viewer"]),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72),
});

/** Quản trị tạo tài khoản đăng nhập bằng email + mật khẩu cho nhân viên (không cần gửi email xác nhận). */
export async function createStaffAccount(input: z.input<typeof StaffInput>): Promise<ActionResult<{ email: string }>> {
  try {
    const session = await getSession();
    if (session?.profile?.role !== "admin") throw new Error("Chỉ Quản trị được tạo tài khoản");
    const v = StaffInput.parse(input);
    const allowed = process.env.ALLOWED_EMAIL_DOMAIN;
    if (allowed && !v.email.endsWith(`@${allowed}`))
      throw new Error(`Hệ thống chỉ cho email @${allowed} đăng nhập (ALLOWED_EMAIL_DOMAIN)`);

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: v.email,
      password: v.password,
      email_confirm: true,
      user_metadata: { full_name: v.fullName },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) throw new Error(`Email ${v.email} đã có tài khoản`);
      throw error;
    }
    // Hồ sơ được tạo tự động (trigger) với vai trò mặc định → đặt đúng tên và vai trò Quản trị chọn
    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id: data.user.id, email: v.email, full_name: v.fullName, role: v.role }, { onConflict: "id" });
    if (pErr) throw pErr;
    revalidatePath("/settings");
    return { ok: true, data: { email: v.email } };
  } catch (e) {
    return fail(e);
  }
}

/** Người dùng tự đổi mật khẩu của mình (vd. sau khi nhận mật khẩu tạm từ Quản trị). */
export async function updateMyPassword(password: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    if (password.length < 8) throw new Error("Mật khẩu tối thiểu 8 ký tự");
    const { error } = await session.supabase.auth.updateUser({ password });
    if (error) throw error;
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
