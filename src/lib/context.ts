import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "./supabase/server";
import type { Project } from "./types";

export const PROJECT_COOKIE = "project_id";

/** Phiên làm việc + danh sách dự án + dự án đang chọn (lưu trong cookie). */
export async function getWorkspace() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { supabase, user } = session;
  const { data: projects } = await supabase.from("projects").select("*").order("created_at");
  const list = (projects ?? []) as Project[];
  const store = await cookies();
  const wanted = store.get(PROJECT_COOKIE)?.value;
  const active = list.find((p) => p.id === wanted) ?? list[0] ?? null;
  return { supabase, user, profile: session.profile, projects: list, active };
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function fail(err: unknown): { ok: false; error: string } {
  console.error(err);
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}
