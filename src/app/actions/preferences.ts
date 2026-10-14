"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PROJECT_COOKIE } from "@/lib/context";
import { UI_LOCALES, type UiLocale } from "@/lib/locales";
import { getSession } from "@/lib/supabase/server";

const YEAR = 60 * 60 * 24 * 365;

export async function setUiLocale(locale: UiLocale) {
  if (!UI_LOCALES.includes(locale)) return;
  const store = await cookies();
  store.set("ui_locale", locale, { path: "/", maxAge: YEAR });
  const session = await getSession();
  if (session) await session.supabase.from("profiles").update({ ui_locale: locale }).eq("id", session.user.id);
  revalidatePath("/", "layout");
}

export async function setActiveProject(projectId: string) {
  const store = await cookies();
  store.set(PROJECT_COOKIE, projectId, { path: "/", maxAge: YEAR });
  revalidatePath("/", "layout");
}
