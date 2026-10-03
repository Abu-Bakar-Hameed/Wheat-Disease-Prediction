/**
 * Single source of truth for the admin console's routes.
 * Used by AdminSidebar (links + active state) and AdminTopBar (page title/subtitle).
 */
export interface AdminNavItem {
  href: string;
  icon: string;
  label: string;
  subtitle: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin",                icon: "dashboard",        label: "Dashboard",         subtitle: "Overview of system activity and key metrics" },
  { href: "/admin/users",          icon: "group",            label: "User Management",   subtitle: "Add, edit and manage user accounts" },
  { href: "/admin/user-retention", icon: "person_pin_circle",label: "User Retention",    subtitle: "Track user activity, engagement and retention rates" },
  { href: "/admin/diagnosis",      icon: "biotech",          label: "Disease Diagnosis", subtitle: "Browse and review all AI diagnoses" },
  { href: "/admin/queries",         icon: "support_agent",    label: "Queries",           subtitle: "User support queries and conversation threads" },
  { href: "/admin/feedback",        icon: "reviews",          label: "Feedback",          subtitle: "User feedback, ratings and analytics" },
  { href: "/admin/diseases",       icon: "coronavirus",      label: "Plant Management",  subtitle: "Manage disease library and plant information" },
  { href: "/admin/weather-risk",   icon: "thunderstorm",     label: "Weather Risk Rules", subtitle: "Per-disease weather factors, weights and risk-level thresholds" },
  
];

export function adminTitleForPath(pathname: string): { title: string; subtitle: string } {
  // Exact match first, then prefix match so nested admin routes (e.g.
  // /admin/user-retention/users/:userId) keep their section's title.
  const item =
    ADMIN_NAV.find((n) => n.href === pathname) ??
    ADMIN_NAV.find((n) => n.href !== "/admin" && pathname.startsWith(`${n.href}/`));
  return item
    ? { title: item.label, subtitle: item.subtitle }
    : { title: "Dashboard", subtitle: "Overview of system activity and key metrics" };
}
