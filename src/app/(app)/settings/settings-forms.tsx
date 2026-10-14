"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateMemberRole, updateMyName } from "@/app/actions/team";
import { Button, Field, Input, Select } from "@/components/ui";
import type { StaffRole } from "@/lib/types";

export function ProfileForm({ name }: { name: string }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateMyName(value);
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("saved"));
          router.refresh();
        });
      }}
    >
      <div className="flex-1">
        <Field label={t("name")}>
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
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
