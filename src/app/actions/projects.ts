"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { fail, PROJECT_COOKIE, type ActionResult } from "@/lib/context";
import { getSession } from "@/lib/supabase/server";
import { hostOf } from "@/lib/utils";

const ProjectInput = z.object({
  name: z.string().trim().min(1),
  domain: z.string().trim().min(3),
  description: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  default_locale: z.string().min(2),
  locales: z.array(z.string()).min(1),
  country: z.string().length(2),
});
export type ProjectInput = z.infer<typeof ProjectInput>;

export async function saveProject(input: ProjectInput, id?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const data = ProjectInput.parse(input);
    const row = {
      ...data,
      domain: hostOf(data.domain),
      locales: Array.from(new Set([data.default_locale, ...data.locales])),
    };
    if (id) {
      const { error } = await session.supabase.from("projects").update(row).eq("id", id);
      if (error) throw error;
      revalidatePath("/", "layout");
      return { ok: true, data: { id } };
    }
    const { data: created, error } = await session.supabase
      .from("projects")
      .insert({ ...row, created_by: session.user.id })
      .select("id")
      .single();
    if (error) throw error;
    (await cookies()).set(PROJECT_COOKIE, created.id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
