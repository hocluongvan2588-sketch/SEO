"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { runAudit } from "@/app/actions/audits";
import { Button, Card, Input } from "@/components/ui";
import { useCostLabel } from "@/components/use-cost";

export function AuditForm({ projectId, domain, canWrite }: { projectId: string; domain: string; canWrite: boolean }) {
  const t = useTranslations("audits");
  const router = useRouter();
  const costLabel = useCostLabel();
  const [url, setUrl] = useState("");
  const [withAi, setWithAi] = useState(true);
  const [pending, start] = useTransition();

  return (
    <Card className="p-5">
      <form
        className="flex flex-col gap-3 md:flex-row md:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await runAudit({ projectId, url, withAi });
            if (!res.ok) return void toast.error(t("failed"), { description: res.error });
            toast.success(t("done"), { description: costLabel(res.data.costUsd) });
            router.push(`/audits/${res.data.id}`);
          });
        }}
      >
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`https://${domain}/…`} disabled={pending} required />
        </div>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} disabled={pending} />
          {t("withAi")}
        </label>
        <Button type="submit" loading={pending} disabled={!canWrite}>
          {!pending && <ScanSearch className="h-4 w-4" />}
          {t("run")}
        </Button>
      </form>
      {pending && (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-primary-soft/50 px-4 py-3 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {withAi ? t("runningAi") : t("running")}
        </div>
      )}
    </Card>
  );
}
