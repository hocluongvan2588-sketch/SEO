import { AppShell } from "@/components/shell/app-shell";
import { getWorkspace } from "@/lib/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, user, projects, active } = await getWorkspace();
  return (
    <AppShell
      user={{ email: user.email ?? "", name: profile?.full_name ?? user.email ?? "", role: profile?.role ?? "viewer" }}
      projects={projects.map((p) => ({ id: p.id, name: p.name, domain: p.domain }))}
      activeProjectId={active?.id ?? null}
    >
      {children}
    </AppShell>
  );
}
