"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Braces, FolderKanban, Plus, ScanSearch, Search } from "lucide-react";
import { setActiveProject } from "@/app/actions/preferences";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void | Promise<void>;
}

export function CommandPalette({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string; domain: string }[];
}) {
  const t = useTranslations("nav");
  const tp = useTranslations("palette");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    const all: Item[] = [
      { id: "a-research", label: tp("research"), icon: Search, run: go("/keywords?tab=research") },
      { id: "a-audit", label: tp("audit"), icon: ScanSearch, run: go("/audits") },
      { id: "a-schema", label: tp("schema"), icon: Braces, run: go("/schemas") },
      { id: "a-project", label: tp("newProject"), icon: Plus, run: go("/projects?new=1") },
      ...NAV.map((n) => ({ id: `n-${n.href}`, label: t(n.key), hint: tp("goTo"), icon: n.icon, run: go(n.href) })),
      ...projects.map((p) => ({
        id: `p-${p.id}`,
        label: p.name,
        hint: p.domain,
        icon: FolderKanban,
        run: () =>
          start(async () => {
            await setActiveProject(p.id);
            router.refresh();
          }),
      })),
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q)) : all;
  }, [query, projects, router, t, tp]);

  if (!open) return null;

  const choose = (item?: Item) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                choose(items[index]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder={tp("placeholder")}
            className="h-12 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">{tp("empty")}</div>}
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(item)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                  i === index ? "bg-primary-soft text-primary" : "text-text",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="truncate text-xs text-muted">{item.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
