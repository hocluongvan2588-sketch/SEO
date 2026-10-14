"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/context";
import { getSession } from "@/lib/supabase/server";

const BudgetInput = z.object({
  claude: z.number().min(0).max(100000),
  brightdata: z.number().min(0).max(100000),
});

export async function updateBudgets(input: { claude: number; brightdata: number }): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (session?.profile?.role !== "admin") throw new Error("Admin only");
    const v = BudgetInput.parse(input);
    const { error } = await session.supabase
      .from("app_settings")
      .update({ claude_budget_usd: v.claude, brightdata_budget_usd: v.brightdata, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
