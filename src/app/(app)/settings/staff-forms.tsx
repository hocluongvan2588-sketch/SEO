"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createStaffAccount, updateMyPassword } from "@/app/actions/team";
import { Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import type { StaffRole } from "@/lib/types";

/** Mật khẩu tạm dễ đọc (bỏ ký tự dễ nhầm 0/O, 1/l/I) */
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function AddStaffButton({ allowedDomain, loginUrl }: { allowedDomain: string | null; loginUrl: string }) {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" />
        {t("addStaff")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("addStaff")}>
        {open && <AddStaffForm allowedDomain={allowedDomain} loginUrl={loginUrl} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function AddStaffForm({ allowedDomain, loginUrl, onClose }: { allowedDomain: string | null; loginUrl: string; onClose: () => void }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [v, setV] = useState({ email: "", fullName: "", role: "editor" as StaffRole, password: generatePassword() });
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  // Sau khi tạo: hiện thông tin đăng nhập để Quản trị gửi cho nhân viên (mật khẩu không lưu lại ở đâu khác)
  if (created) {
    const message = t("credentialsMessage", { name: v.fullName, url: loginUrl, email: v.email, password: v.password });
    return (
      <div className="space-y-4">
        <p className="text-sm text-text">{t("createdDesc", { email: created })}</p>
        <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-text">{message}</pre>
        <p className="text-xs text-muted">{t("passwordOnce")}</p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(message);
              setCopied(true);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t("copied") : t("copyCredentials")}
          </Button>
          <Button onClick={onClose}>{t("done")}</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createStaffAccount(v);
          if (!r.ok) return void toast.error(r.error);
          setCreated(r.data.email);
          router.refresh();
        });
      }}
    >
      <Field label={t("staffEmail")} hint={allowedDomain ? t("domainHint", { domain: allowedDomain }) : undefined}>
        <Input type="email" required autoComplete="off" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder={`ten@${allowedDomain ?? "veximglobal.com"}`} />
      </Field>
      <Field label={t("name")}>
        <Input required value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
      </Field>
      <Field label={t("role")} hint={t(`roleHint.${v.role}`)}>
        <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as StaffRole })}>
          {(["editor", "viewer", "admin"] as const).map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("tempPassword")} hint={t("tempPasswordHint")}>
        <div className="flex gap-2">
          <Input required minLength={8} autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className="font-mono" />
          <Button type="button" variant="secondary" size="icon" title={t("regenerate")} onClick={() => setV({ ...v, password: generatePassword() })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          <UserPlus className="h-4 w-4" />
          {t("createAccount")}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("settings");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (pw !== confirm) return void toast.error(t("passwordMismatch"));
        start(async () => {
          const r = await updateMyPassword(pw);
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("passwordChanged"));
          setPw("");
          setConfirm("");
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("newPassword")}>
          <Input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label={t("confirmPassword")}>
          <Input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={pending}>
          <KeyRound className="h-4 w-4" />
          {t("changePassword")}
        </Button>
      </div>
    </form>
  );
}
