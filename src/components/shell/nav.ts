import { BarChart3, Braces, FolderKanban, LayoutDashboard, ScanSearch, Search, Settings } from "lucide-react";

export const NAV = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/keywords", key: "keywords", icon: Search },
  { href: "/audits", key: "audits", icon: ScanSearch },
  { href: "/schemas", key: "schemas", icon: Braces },
  { href: "/rankings", key: "rankings", icon: BarChart3 },
  { href: "/projects", key: "projects", icon: FolderKanban },
  { href: "/settings", key: "settings", icon: Settings },
] as const;
