import { getTranslations } from "next-intl/server";
import { CheckCircle2, CircleAlert, Plug, Users } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/context";
import type { Profile } from "@/lib/types";
import { ProfileForm, RoleSelect } from "./settings-forms";

export default async function SettingsPage() {
  const { supabase, profile, user } = await getWorkspace();
  const t = await getTranslations("settings");
  const { data: team } = await supabase.from("profiles").select("*").order("created_at");
  const isAdmin = profile?.role === "admin";

  const integrations = [
    { name: "Supabase", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), detail: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, "") },
    { name: "Bright Data", ok: Boolean(process.env.BRIGHTDATA_API_TOKEN), detail: `SERP: ${process.env.BRIGHTDATA_SERP_ZONE || "serp_api1"} · Unlocker: ${process.env.BRIGHTDATA_UNLOCKER_ZONE || "web_unlocker1"}` },
    { name: "Claude API", ok: Boolean(process.env.ANTHROPIC_API_KEY), detail: process.env.ANTHROPIC_MODEL || "claude-opus-5-5" },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("profile")} description={user.email} />
          <div className="p-5">
            <ProfileForm name={profile?.full_name ?? ""} />
          </div>
        </Card>

        <Card>
          <CardHeader title={t("integrations")} icon={<Plug className="h-4 w-4" />} />
          <ul className="divide-y divide-border">
            {integrations.map((i) => (
              <li key={i.name} className="flex items-center gap-3 px-5 py-3">
                {i.ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <CircleAlert className="h-5 w-5 text-danger" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text">{i.name}</div>
                  <div className="truncate text-xs text-muted">{i.ok ? i.detail : t("notConfigured")}</div>
                </div>
                <Badge tone={i.ok ? "success" : "danger"}>{i.ok ? t("connected") : t("missing")}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t("team", { count: team?.length ?? 0 })} description={t("teamDesc")} icon={<Users className="h-4 w-4" />} />
          <ul className="divide-y divide-border">
            {((team ?? []) as Profile[]).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                  {(m.full_name ?? m.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text">{m.full_name}</div>
                  <div className="truncate text-xs text-muted">{m.email}</div>
                </div>
                {isAdmin && m.id !== user.id ? <RoleSelect id={m.id} role={m.role} /> : <Badge tone="primary">{t(`roles.${m.role}`)}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
