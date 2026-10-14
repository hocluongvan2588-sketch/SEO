"use server";

import { revalidatePath } from "next/cache";
import { auditInsights } from "@/lib/ai";
import { parsePage, runChecks, scoreChecks } from "@/lib/audit";
import { fetchPage } from "@/lib/brightdata";
import { fail, type ActionResult } from "@/lib/context";
import { metered } from "@/lib/usage";
import { staffLocale } from "@/lib/staff-locale";
import { getSession } from "@/lib/supabase/server";
import { normalizeUrl } from "@/lib/utils";

export async function runAudit(input: {
  projectId: string;
  url: string;
  withAi: boolean;
}): Promise<ActionResult<{ id: string; costUsd: number }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { data: project, error: pErr } = await session.supabase.from("projects").select("*").eq("id", input.projectId).single();
    if (pErr) throw pErr;

    const url = normalizeUrl(input.url);
    new URL(url); // validate
    const lang = await staffLocale();
    const {
      result: { page, via, checks, score, ai },
      costUsd,
    } = await metered(
      {
        supabase: session.supabase,
        userId: session.user.id,
        projectId: project.id,
        feature: "audit",
        providers: input.withAi ? ["brightdata", "claude"] : ["brightdata"],
      },
      async () => {
        const { html, status, via } = await fetchPage(url);
        const page = parsePage(url, html, status);
        const checks = runChecks(page, { projectLocales: project.locales, projectMarkets: project.markets ?? [project.country] });
        const score = scoreChecks(checks);
        const ai = input.withAi
          ? await auditInsights({ url, checks, page: page as unknown as Record<string, unknown>, staffLocale: lang })
          : null;
        return { page, via, checks, score, ai };
      },
    );

    const { data, error } = await session.supabase
      .from("audits")
      .insert({ project_id: project.id, url, score, checks, page: { ...page, fetchedVia: via }, ai, created_by: session.user.id })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/audits");
    revalidatePath("/");
    return { ok: true, data: { id: data.id, costUsd } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAudit(id: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("audits").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/audits");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
