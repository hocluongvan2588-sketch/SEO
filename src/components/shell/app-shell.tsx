"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check, ChevronsUpDown, Command, Globe, LogOut, Menu, Moon, Plus, Sun, X } from "lucide-react";
import { setActiveProject, setUiLocale } from "@/app/actions/preferences";
import { signOut } from "@/app/actions/auth";
import { BrandMark } from "@/components/brand-mark";
import { Kbd } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";
import { CommandPalette } from "./command-palette";

interface ShellProps {
  user: { email: string; name: string; role: string };
  projects: { id: string; name: string; domain: string }[];
  activeProjectId: string | null;
  profileMissing?: boolean;
  userId?: string;
  /** Tỉ lệ đã dùng ngân sách tháng (1 = 100%) */
  budget?: { claude: number; brightdata: number } | null;
  children: React.ReactNode;
}

export function AppShell({ user, projects, activeProjectId, profileMissing, userId, budget, children }: ShellProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <BrandMark size={34} />
        <div className="leading-tight">
          <div className="font-semibold text-text">{BRAND.name}</div>
          <div className="text-[11px] text-muted">{t("tagline")}</div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} />
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.filter((item) => !item.adminOnly || user.role === "admin").map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={() => setPaletteOpen(true)}
          className="mb-2 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2"
        >
          <span className="flex items-center gap-2">
            <Command className="h-4 w-4" />
            {t("quickActions")}
          </span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text">{user.name}</div>
            <div className="truncate text-xs text-muted">{t(`role.${user.role}`)}</div>
          </div>
          <form action={signOut}>
            <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" title={t("signOut")}>
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface lg:block print:hidden">{sidebar}</aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-surface">
            <button className="absolute right-3 top-4 p-1 text-muted" onClick={() => setMobileOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 flex h-16 print:hidden items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden text-sm text-muted lg:block">
            {projects.find((p) => p.id === activeProjectId)?.domain}
          </div>
          <div className="flex items-center gap-1">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8 print:max-w-none print:p-0">
          {profileMissing && (
            <div className="mb-6 flex gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-text print:hidden">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <div className="font-medium">{t("profileMissingTitle")}</div>
                <div className="mt-0.5 text-muted">{t("profileMissingDesc", { email: user.email, id: userId ?? "" })}</div>
              </div>
            </div>
          )}
          <div className="print:hidden">
            <BudgetBanner budget={budget} isAdmin={user.role === "admin"} />
          </div>
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} projects={projects} isAdmin={user.role === "admin"} />
    </div>
  );
}

function ProjectSwitcher({ projects, activeProjectId }: Pick<ShellProps, "projects" | "activeProjectId">) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const active = projects.find((p) => p.id === activeProjectId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-left hover:bg-surface-2",
          pending && "opacity-60",
        )}
      >
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted">{t("project")}</div>
          <div className="truncate text-sm font-medium text-text">{active?.name ?? t("noProject")}</div>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            <div className="max-h-72 overflow-y-auto py-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setOpen(false);
                    start(async () => {
                      await setActiveProject(p.id);
                      router.refresh();
                    });
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text">{p.name}</div>
                    <div className="truncate text-xs text-muted">{p.domain}</div>
                  </div>
                  {p.id === activeProjectId && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
            <Link
              href="/projects?new=1"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm text-primary hover:bg-surface-2"
            >
              <Plus className="h-4 w-4" />
              {t("newProject")}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function LocaleToggle() {
  const locale = useLocale();
  const [pending, start] = useTransition();
  const router = useRouter();
  const next = locale === "vi" ? "en" : "vi";
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setUiLocale(next);
          router.refresh();
        })
      }
      className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text"
      title="Language"
    >
      <Globe className="h-4 w-4" />
      {locale.toUpperCase()}
    </button>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <button
      onClick={() => {
        const d = !dark;
        setDark(d);
        document.documentElement.classList.toggle("dark", d);
        try {
          localStorage.setItem("theme", d ? "dark" : "light");
        } catch {}
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
      title="Theme"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** Cảnh báo khi đã dùng ≥ 80% ngân sách tháng; ≥ 100% thì các chức năng tốn phí bị tạm khóa */
function BudgetBanner({ budget, isAdmin }: { budget?: { claude: number; brightdata: number } | null; isAdmin: boolean }) {
  const t = useTranslations("nav");
  if (!budget) return null;
  const items = (["claude", "brightdata"] as const)
    .map((k) => ({ k, ratio: budget[k] }))
    .filter((x) => x.ratio >= 0.8);
  if (!items.length) return null;
  const over = items.some((x) => x.ratio >= 1);
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        over ? "border-danger/40 bg-danger-soft" : "border-warning/40 bg-warning-soft",
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", over ? "text-danger" : "text-warning")} />
        <div className="text-text">
          {items.map((x) => (
            <div key={x.k}>
              {t(x.ratio >= 1 ? "budgetOver" : "budgetNear", {
                provider: x.k === "claude" ? "Claude API" : "Bright Data",
                pct: Math.round(x.ratio * 100),
              })}
            </div>
          ))}
        </div>
      </div>
      {isAdmin && (
        <Link href="/usage" className="shrink-0 font-medium text-primary hover:underline">
          {t("budgetManage")}
        </Link>
      )}
    </div>
  );
}
