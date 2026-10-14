"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/context";
import { getSession } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export async function updateMemberRole(id: string, role: StaffRole): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (session?.profile?.role !== "admin") throw new Error("Admin only");
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
