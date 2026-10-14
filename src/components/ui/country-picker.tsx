"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { countryName, flag, POPULAR_MARKETS, sortedCountries } from "@/lib/locales";
import { cn } from "@/lib/utils";

/** Bỏ dấu + chữ thường: "Đức" → "duc" */
function fold(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
}

interface BaseProps {
  /** Ưu tiên hiển thị các mã này ở đầu danh sách (vd: thị trường của dự án) */
  pinned?: string[];
  disabled?: boolean;
  className?: string;
}

/** Chọn một quốc gia, có ô tìm kiếm. */
export function CountrySelect({ value, onChange, ...rest }: BaseProps & { value: string; onChange: (code: string) => void }) {
  const locale = useLocale();
  return (
    <Picker
      {...rest}
      selected={[value]}
      onToggle={(code) => onChange(code)}
      closeOnSelect
      trigger={
        <span className="flex min-w-0 items-center gap-2">
          <span>{flag(value)}</span>
          <span className="truncate">{countryName(value, locale)}</span>
        </span>
      }
    />
  );
}

/** Chọn nhiều quốc gia (thị trường mục tiêu). */
export function CountryMultiSelect({
  value,
  onChange,
  locked = [],
  ...rest
}: BaseProps & { value: string[]; onChange: (codes: string[]) => void; locked?: string[] }) {
  const t = useTranslations("picker");
  const locale = useLocale();
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((code) => (
          <span key={code} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary">
            {flag(code)} {countryName(code, locale)}
            {!locked.includes(code) && (
              <button type="button" onClick={() => onChange(value.filter((c) => c !== code))} className="rounded-full p-0.5 hover:bg-primary/10">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <Picker
        {...rest}
        selected={value}
        onToggle={(code) => {
          if (locked.includes(code)) return;
          onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
        }}
        trigger={<span className="text-muted">{t("addMarket")}</span>}
      />
    </div>
  );
}

function Picker({
  selected,
  onToggle,
  trigger,
  pinned = [],
  disabled,
  className,
  closeOnSelect,
}: BaseProps & { selected: string[]; onToggle: (code: string) => void; trigger: React.ReactNode; closeOnSelect?: boolean }) {
  const t = useTranslations("picker");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const all = useMemo(() => sortedCountries(locale), [locale]);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const groups = useMemo(() => {
    const query = fold(q.trim());
    // Tìm theo tên tiếng Việt (có/không dấu), tên tiếng Anh hoặc mã quốc gia
    const match = (c: { code: string; name: string }) =>
      !query || fold(c.name).includes(query) || fold(countryName(c.code, "en")).includes(query) || c.code === query;
    if (query) return [{ title: null as string | null, items: all.filter(match) }];
    const top = Array.from(new Set([...pinned, ...POPULAR_MARKETS]));
    return [
      { title: t("suggested"), items: top.map((code) => ({ code, name: countryName(code, locale) })) },
      { title: t("all"), items: all.filter((c) => !top.includes(c.code)) },
    ];
  }, [q, all, pinned, locale, t]);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm text-text hover:bg-surface-2 disabled:opacity-60"
      >
        {trigger}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-1 w-full min-w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                placeholder={t("search")}
                className="h-10 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {groups.map((g) => (
                <div key={g.title ?? "results"}>
                  {g.title && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.title}</div>}
                  {g.items.map((c) => {
                    const on = selected.includes(c.code);
                    return (
                      <button
                        type="button"
                        key={c.code}
                        onClick={() => {
                          onToggle(c.code);
                          if (closeOnSelect) setOpen(false);
                        }}
                        className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2", on && "text-primary")}
                      >
                        <span>{flag(c.code)}</span>
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-xs uppercase text-muted">{c.code}</span>
                        {on && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              ))}
              {groups.every((g) => g.items.length === 0) && <div className="px-3 py-6 text-center text-sm text-muted">{t("empty")}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
