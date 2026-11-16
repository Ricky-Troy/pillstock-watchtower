import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Boxes,
  PackagePlus,
  ShoppingCart,
  ArrowLeftRight,
  BellRing,
  ClipboardCheck,
  BarChart3,
  Users,
  ScrollText,
} from "lucide-react";

export type Role = "admin" | "pharmacist" | "storekeeper";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  pharmacist: "Pharmacist",
  storekeeper: "Storekeeper",
};

export type NavItem = {
  to:
    | "/dashboard"
    | "/stock"
    | "/stock-in"
    | "/stock-out"
    | "/transactions"
    | "/alerts"
    | "/audit"
    | "/reports"
    | "/users"
    | "/activity";
  label: string;
  icon: LucideIcon;
  roles: Role[];
};

/** Who can open which page. Must mirror the permission checks in the database functions. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "pharmacist", "storekeeper"] },
  { to: "/stock", label: "Stock Management", icon: Boxes, roles: ["admin"] },
  { to: "/stock-in", label: "Record Stock In", icon: PackagePlus, roles: ["admin", "storekeeper"] },
  { to: "/stock-out", label: "Record Stock Out", icon: ShoppingCart, roles: ["admin", "pharmacist"] },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight, roles: ["admin", "pharmacist", "storekeeper"] },
  { to: "/alerts", label: "Alerts", icon: BellRing, roles: ["admin", "pharmacist", "storekeeper"] },
  { to: "/audit", label: "Stock Audit", icon: ClipboardCheck, roles: ["admin", "storekeeper"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "pharmacist"] },
  { to: "/users", label: "Manage Users", icon: Users, roles: ["admin"] },
  { to: "/activity", label: "Activity Log", icon: ScrollText, roles: ["admin"] },
];

export function navForRole(role: Role) {
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}

export function canAccess(role: Role, pathname: string) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const item = NAV_ITEMS.find((i) => clean === i.to || clean.startsWith(`${i.to}/`));
  if (!item) return true;
  return item.roles.includes(role);
}

const PRIORITY: Role[] = ["admin", "pharmacist", "storekeeper"];

export function primaryRole(roles: string[]): Role | null {
  return PRIORITY.find((r) => roles.includes(r)) ?? null;
}
