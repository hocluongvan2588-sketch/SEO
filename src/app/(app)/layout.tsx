import { AppShell } from "@/components/shell/app-shell";
import { getWorkspace } from "@/lib/context";
import { getMonthSpend } from "@/lib/usage";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, user, projects, active } = await getWorkspace();
  const spend = await getMonthSpend(supabase);
  return (
    <AppShell
      user={{ email: user.email ?? "", name: profile?.full_name ?? user.email ?? "", role: profile?.role ?? "unknown" }}
      profileMissing={!profile}
      userId={user.id}
      budget={
        spend && {
          claude: spend.claude_budget_usd > 0 ? spend.claude_usd / spend.claude_budget_usd : 1,
          brightdata: spend.brightdata_budget_usd > 0 ? spend.brightdata_usd / spend.brightdata_budget_usd : 1,
        }
      }
      projects={projects.map((p) => ({ id: p.id, name: p.name, domain: p.domain }))}
      activeProjectId={active?.id ?? null}
    >
      {children}
    </AppShell>
  );
}
