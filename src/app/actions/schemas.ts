"use server";

import { revalidatePath } from "next/cache";
import { schemaFromPage } from "@/lib/ai";
import { extractText } from "@/lib/audit";
import { fetchPage } from "@/lib/brightdata";
import { fail, type ActionResult } from "@/lib/context";
import { staffLocale } from "@/lib/staff-locale";
import { getSession } from "@/lib/supabase/server";
import { normalizeUrl } from "@/lib/utils";

export async function saveSchema(input: {
  projectId: string;
  name: string;
  schemaType: string;
  locale: string;
  input: Record<string, unknown> | null;
  jsonLd: Record<string, unknown>;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { data, error } = await session.supabase
      .from("schemas")
      .insert({
        project_id: input.projectId,
        name: input.name.trim() || input.schemaType,
        schema_type: input.schemaType,
        locale: input.locale,
        input: input.input,
        json_ld: input.jsonLd,
        created_by: session.user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/schemas");
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function generateSchemaFromUrl(input: {
  projectId: string;
  url: string;
  locale: string;
}): Promise<ActionResult<{ schemaType: string; name: string; jsonLd: Record<string, unknown>; notes: string }>> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { data: project, error } = await session.supabase.from("projects").select("*").eq("id", input.projectId).single();
    if (error) throw error;
    const url = normalizeUrl(input.url);
    const { html } = await fetchPage(url);
    const out = await schemaFromPage({ url, locale: input.locale, project, pageText: extractText(html), staffLocale: await staffLocale() });
    return { ok: true, data: { schemaType: out.schema_type, name: out.name, jsonLd: out.json_ld, notes: out.notes } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSchema(id: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");
    const { error } = await session.supabase.from("schemas").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/schemas");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
