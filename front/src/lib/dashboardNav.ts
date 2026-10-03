/**
 * Single source of truth for the farmer/user dashboard's routes.
 * Used by UserSidebar (links + active state) and UserTopBar (page title).
 */
export interface NavItem {
  href: string;
  icon: string;
  label: string;
  /** Shown in the topbar heading; falls back to `label` when omitted. */
  title?: string;
}

export const DASHBOARD_PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard",           icon: "space_dashboard", label: "Dashboard" },
  { href: "/dashboard/detection", icon: "upload",          label: "Predict Disease", title: "Predict Disease" },
  { href: "/dashboard/history",   icon: "history",         label: "History" },
  { href: "/dashboard/calendar",  icon: "calendar_month",  label: "Calendar" },
  { href: "/dashboard/library",   icon: "menu_book",       label: "About Disease" },
];

export const DASHBOARD_MORE_NAV: NavItem[] = [
  
  { href: "/dashboard/weather",   icon: "thunderstorm",  label: "Weather Risks" },
];

export const DASHBOARD_NAV: NavItem[] = [...DASHBOARD_PRIMARY_NAV, ...DASHBOARD_MORE_NAV];

/**
 * Headings for dashboard routes reachable via the header (not the sidebar nav),
 * so the topbar always shows the correct page title.
 */
const EXTRA_TITLES: Record<string, string> = {
  "/dashboard/assistant": "AI Assistant",
  "/dashboard/detection/result": "Analysis Result",
};

/** Returns the topbar heading for a given dashboard pathname. */
export function dashboardTitleForPath(pathname: string): string {
  const exact = DASHBOARD_NAV.find((n) => n.href === pathname);
  if (exact) return exact.title ?? exact.label;
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname];
  // Nested routes (e.g. /dashboard/chatbot/new) keep their parent's heading.
  // "/dashboard" is excluded so it cannot swallow every nested path.
  const prefixed = DASHBOARD_NAV
    .filter((n) => n.href !== "/dashboard" && pathname.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (prefixed) return prefixed.title ?? prefixed.label;
  const extraPath = Object.keys(EXTRA_TITLES)
    .filter((p) => pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return extraPath ? EXTRA_TITLES[extraPath] : "Dashboard";
}
