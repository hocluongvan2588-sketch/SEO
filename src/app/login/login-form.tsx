"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { sendMagicLink, signInWithPassword } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const t = useTranslations("login");
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      if (mode === "password") {
        const res = await signInWithPassword(email, password);
        if (!res.ok) return void toast.error(t("failed"), { description: res.error });
        router.replace(next && next.startsWith("/") ? next : "/");
        router.refresh();
      } else {
        const res = await sendMagicLink(email);
        if (!res.ok) return void toast.error(t("failed"), { description: res.error });
        setSent(true);
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-soft via-bg to-bg px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-fg">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold text-text">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error === "domain" ? t("errorDomain") : t("errorLink")}
          </div>
        )}

        {sent ? (
          <div className="rounded-lg bg-success-soft p-4 text-center text-sm text-success">
            <Mail className="mx-auto mb-2 h-5 w-5" />
            {t("checkEmail", { email })}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("email")}>
              <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@congty.vn" />
            </Field>
            {mode === "password" && (
              <Field label={t("password")}>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            <Button type="submit" className="w-full" loading={pending}>
              {mode === "password" ? t("signIn") : t("sendLink")}
            </Button>
            <button
              type="button"
              onClick={() => setMode(mode === "password" ? "magic" : "password")}
              className="w-full text-center text-sm text-primary hover:underline"
            >
              {mode === "password" ? t("useMagic") : t("usePassword")}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
