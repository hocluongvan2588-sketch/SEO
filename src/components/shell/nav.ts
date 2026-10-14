import { BarChart3, Braces, FolderKanban, LayoutDashboard, ScanSearch, Search, Settings, Wallet } from "lucide-react";

/** `adminOnly`: chỉ hiện cho Quản trị */
export const NAV: { href: string; key: string; icon: typeof Wallet; adminOnly?: boolean }[] = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/keywords", key: "keywords", icon: Search },
  { href: "/audits", key: "audits", icon: ScanSearch },
  { href: "/schemas", key: "schemas", icon: Braces },
  { href: "/rankings", key: "rankings", icon: BarChart3 },
  { href: "/projects", key: "projects", icon: FolderKanban },
  { href: "/usage", key: "usage", icon: Wallet, adminOnly: true },
  { href: "/settings", key: "settings", icon: Settings },
];
