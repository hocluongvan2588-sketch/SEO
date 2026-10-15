import { BarChart3, Braces, FileText, FolderKanban, Handshake, LayoutDashboard, Package, ScanSearch, Search, Settings, Wallet } from "lucide-react";

/** `adminOnly`: chỉ hiện cho Quản trị */
export const NAV: { href: string; key: string; icon: typeof Wallet; adminOnly?: boolean }[] = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/products", key: "products", icon: Package },
  { href: "/keywords", key: "keywords", icon: Search },
  { href: "/audits", key: "audits", icon: ScanSearch },
  { href: "/schemas", key: "schemas", icon: Braces },
  { href: "/rankings", key: "rankings", icon: BarChart3 },
  { href: "/leads", key: "leads", icon: Handshake },
  { href: "/reports", key: "reports", icon: FileText },
  { href: "/projects", key: "projects", icon: FolderKanban },
  { href: "/usage", key: "usage", icon: Wallet, adminOnly: true },
  { href: "/settings", key: "settings", icon: Settings },
];
