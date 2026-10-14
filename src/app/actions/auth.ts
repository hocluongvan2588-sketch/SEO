"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/context";

export async function signInWithPassword(email: string, password: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function sendMagicLink(email: string): Promise<ActionResult> {
  const supabase = await createClient();
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: process.env.ALLOW_SIGNUP === "true" },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
