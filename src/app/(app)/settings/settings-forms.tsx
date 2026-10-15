"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateMemberRole, updateMyProfile } from "@/app/actions/team";
import { Button, Field, Input, Select } from "@/components/ui";
import type { StaffRole } from "@/lib/types";

export function ProfileForm({ name, jobTitle, phone }: { name: string; jobTitle: string; phone: string }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [v, setV] = useState({ fullName: name, jobTitle, phone });
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateMyProfile(v);
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("saved"));
          router.refresh();
        });
      }}
    >
      <Field label={t("name")}>
        <Input value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("jobTitle")}>
          <Input value={v.jobTitle} placeholder={t("jobTitlePh")} onChange={(e) => setV({ ...v, jobTitle: e.target.value })} />
        </Field>
        <Field label={t("phone")}>
          <Input type="tel" value={v.phone} placeholder="+84 …" onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs text-muted">{t("contactHint")}</p>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function RoleSelect({ id, role }: { id: string; role: StaffRole }) {
  const t = useTranslations("settings");
  const [, start] = useTransition();
  return (
    <Select
      className="h-8 w-32 text-xs"
      defaultValue={role}
      onChange={(e) =>
        start(async () => {
          const r = await updateMemberRole(id, e.target.value as StaffRole);
          if (!r.ok) toast.error(r.error);
          else toast.success(t("saved"));
        })
      }
    >
      {(["admin", "editor", "viewer"] as const).map((r) => (
        <option key={r} value={r}>
          {t(`roles.${r}`)}
        </option>
      ))}
    </Select>
  );
}
