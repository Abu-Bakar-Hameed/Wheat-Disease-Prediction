"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/appState";
import { useAuth } from "@/lib/auth";
import { fetchHistory, type HistoryItem } from "@/lib/api";
import { DASHBOARD_PRIMARY_NAV, DASHBOARD_MORE_NAV, type NavItem } from "@/lib/dashboardNav";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/wg/ui";
import { SidebarArt } from "./SidebarArt";
import "./views/sidebar.css";

/**
 * User dashboard sidebar.
 *  - Colors come from `./sidebar.css` (self-contained, no Tailwind theme needed):
 *    icy aqua-mint panel + deep-teal active/CTA in light mode, deep teal panel
 *    + bright aqua active/CTA in dark mode.
 *  - Desktop: collapsible rail (264px <-> 72px), preference remembered.
 *  - Mobile: slide-in drawer (always expanded).
 */

const NAV: NavItem[] = [...DASHBOARD_PRIMARY_NAV, ...DASHBOARD_MORE_NAV];
const COLLAPSE_KEY = "wg-sidebar-collapsed";

/** True when a nav item should be highlighted for the current pathname. */
function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // Keep parent items highlighted on nested routes (e.g. /dashboard/history/123).
  return href !== "/dashboard" && pathname.startsWith(`${href}/`);
}

/* ---------- nav link ---------- */

function NavLink({
  href,
  icon,
  label,
  active,
  collapsed,
  onNavigate,
}: NavItem & { active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "wg-sb-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
        collapsed && "justify-center px-0"
      )}
    >
      <Icon name={icon} size={20} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

/* ---------- recent scans ---------- */

function RecentScans({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    let alive = true;
    fetchHistory({ page: 1, limit: 5 })
      .then((res) => {
        if (alive) setItems(res.items ?? []);
      })
      .catch(() => {
        /* the sidebar must never break because history failed */
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  if (items.length === 0) return null;

  return (
    <div>
      <p className="wg-sb-muted mb-1 px-3 text-xs font-medium">Recent scans</p>
      <ul className="space-y-0.5">
        {items.map((h) => {
          const href = `/dashboard/history/${h.id}`;
          const active = pathname === href;
          return (
            <li key={h.id}>
              <Link
                href={href}
                onClick={onNavigate}
                title={h.filename}
                aria-current={active ? "page" : undefined}
                className="wg-sb-link block truncate rounded-lg px-3 py-1.5 text-sm capitalize"
              >
                {h.predicted_class.replace(/_/g, " ")}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- profile menu ---------- */

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { displayName, initials, email, signOut } = useAuth();
  const { setRole } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      // ignore
    }
    setRole("guest");
    window.location.href = "/";
  };

  return (
    <div ref={ref} className="wg-sb-edge-t relative p-3">
      {open && (
        <div
          role="menu"
          className={cn(
            "wg-sb-menu absolute bottom-full left-3 z-20 mb-2 overflow-hidden rounded-xl bg-surface p-1 shadow-lg animate-scale-in",
            collapsed ? "w-52" : "right-3"
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-surface-muted"
          >
            <Icon name="logout" size={18} />
            Log out
          </button>
        </div>
      )}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `Account menu for ${displayName}` : undefined}
        title={collapsed ? displayName : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "wg-sb-link flex w-full items-center gap-3 rounded-lg p-2 text-left",
          collapsed && "justify-center"
        )}
      >
        <span className="wg-sb-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          {initials}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="wg-sb-ink block truncate text-sm font-medium">{displayName}</span>
            <span className="wg-sb-muted block truncate text-xs">{email}</span>
          </span>
        )}
      </button>
    </div>
  );
}

/* ---------- sidebar body ---------- */

function SidebarBody({
  collapsed = false,
  onToggle,
  onNavigate,
  artId = "d",
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  /** Unique SVG gradient/filter id suffix ("d" rail, "m" drawer). */
  artId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setDiagnosticTab } = useApp();

  const handleNewScan = () => {
    setDiagnosticTab("upload");
    router.push("/dashboard/detection");
    onNavigate?.();
  };

  return (
    <div className="wg-sb-root relative flex h-full flex-col overflow-hidden">
      {/* decorative watermark behind content (hidden in the collapsed rail) */}
      {!collapsed && <SidebarArt idSuffix={artId} />}

      {/* all interactive content is raised above the artwork */}
      <div className="relative z-10 flex h-full min-h-0 flex-col">
      {/* brand + collapse toggle */}
      <div className={cn("flex items-center gap-2 px-4 pb-3 pt-4", collapsed && "flex-col px-2")}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg"
        >
          <span className="wg-sb-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Icon name="grass" size={20} />
          </span>
          {!collapsed && (
            <span className="wg-sb-ink truncate font-serif text-lg font-semibold">WheatGuard</span>
          )}
        </Link>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="wg-sb-link rounded-md p-1.5"
          >
            <Icon name={collapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"} size={20} />
          </button>
        )}
      </div>

      {/* primary action */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={handleNewScan}
          title={collapsed ? "New scan" : undefined}
          aria-label={collapsed ? "New scan" : undefined}
          className="wg-sb-cta flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold"
        >
          <Icon name="add_a_photo" size={20} />
          {!collapsed && "New scan"}
        </button>
      </div>

      {/* main nav (always visible) */}
      <nav aria-label="Main" className="shrink-0 space-y-0.5 px-3 pb-3">
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            collapsed={collapsed}
            active={isNavActive(pathname, item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* recents: the only part that scrolls */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!collapsed && <RecentScans onNavigate={onNavigate} />}
      </div>

      {/* profile */}
      <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

/* ---------- public component ---------- */

export interface UserSidebarProps {
  /** Mobile drawer visibility (ignored on desktop where the rail is always shown). */
  open?: boolean;
  onClose?: () => void;
}

export function UserSidebar({ open = false, onClose }: UserSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore the saved preference after mount (avoids a hydration mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  // Lock body scroll while the mobile drawer is open; Escape closes it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          "wg-sb-edge-r hidden shrink-0 transition-[width] duration-200 ease-out lg:sticky lg:top-0 lg:block lg:h-dvh",
          collapsed ? "w-[72px]" : "w-[264px]"
        )}
      >
        <SidebarBody collapsed={collapsed} onToggle={toggleCollapsed} artId="d" />
      </aside>

      {/* Mobile slide-in drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
          <div
            className="absolute left-0 top-0 h-full w-[288px] max-w-[88%] shadow-lg"
            style={{ animation: "wg-drawer-in 0.28s var(--ease-out) both" }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <SidebarBody onNavigate={onClose} artId="m" />
          </div>
        </div>
      )}
    </>
  );
}