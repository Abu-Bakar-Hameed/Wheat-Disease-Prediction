"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/appState";
import { useAuth } from "@/lib/auth";
import { ADMIN_NAV } from "@/lib/adminNav";
import { adminNewQueryCount } from "@/lib/supportApi";
import { adminNewFeedbackCount } from "@/lib/feedbackApi";
import { Icon } from "@/components/wg/ui";
import { cn } from "@/lib/utils";

export interface AdminSidebarProps {
  /** Mobile drawer visibility (ignored on desktop where the rail is always shown). */
  open?: boolean;
  onClose?: () => void;
}

// Persisted desktop rail collapse preference.
const COLLAPSE_KEY = "wg-admin-sidebar-collapsed";

function SidebarBody({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  /** When true the rail shrinks to an icon-only strip (desktop only). */
  collapsed?: boolean;
  /** Provided only on the desktop rail; the mobile drawer never collapses. */
  onToggleCollapse?: () => void;
}) {
  const { setRole } = useApp();
  const { displayName, initials, signOut } = useAuth();
  const pathname = usePathname();

  // Dynamic "new queries" / "new feedback" badges on the nav items.
  const [newQueries, setNewQueries] = useState(0);
  const [newFeedback, setNewFeedback] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      // Skip badge polling while the tab is hidden to save network/backend load.
      if (typeof document !== "undefined" && document.hidden) return;
      adminNewQueryCount().then((n) => { if (alive) setNewQueries(n); });
      adminNewFeedbackCount().then((n) => { if (alive) setNewFeedback(n); });
    };
    // Defer the first fetch to browser idle time so these two count calls never
    // compete with the page's own data load on first paint (keeps the panel
    // snappy). Subsequent refreshes run on a 60s interval.
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let startId: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(() => { tick(); }, { timeout: 2000 });
    } else {
      startId = setTimeout(tick, 1200);
    }
    const id = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (startId !== undefined) clearTimeout(startId);
    };
  }, []);
  const badgeFor = (href: string) =>
    href === "/admin/queries" ? newQueries : href === "/admin/feedback" ? newFeedback : 0;

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
    <div
      className="flex h-full flex-col text-brand-950"
      style={{
        // Soft pastel gradient mesh: mint (#dcfce7) up top blending into warm
        // cream (#fefce8) at the bottom, matching the auth pages' backdrop.
        backgroundImage: [
          "radial-gradient(120% 80% at 0% 0%, #dcfce7 0%, rgba(220,252,231,0) 60%)",
          "radial-gradient(120% 80% at 100% 0%, #d9f99d 0%, rgba(217,249,157,0) 55%)",
          "radial-gradient(120% 90% at 0% 100%, #fef9c3 0%, rgba(254,249,195,0) 55%)",
          "radial-gradient(120% 90% at 100% 100%, #fefce8 0%, rgba(254,252,232,0) 60%)",
          "linear-gradient(180deg, #dcfce7 0%, #fefce8 100%)",
        ].join(", "),
      }}
    >
      {/* Logo / Brand */}
      <div className={cn("border-b border-brand-900/10 px-4 pb-4 pt-5", collapsed && "px-3")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-600/20 bg-white/50">
            <Icon name="eco" size={22} className="text-brand-700" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold leading-tight text-brand-950">WheatGuard AI</div>
              <div className="text-[11px] leading-tight text-brand-900/55">Admin Console</div>
            </div>
          )}
          {onToggleCollapse && !collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-900/50 transition-colors hover:bg-brand-900/5 hover:text-brand-950"
            >
              <Icon name="chevron_left" size={20} />
            </button>
          )}
        </div>

        {onToggleCollapse && collapsed && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-900/50 transition-colors hover:bg-brand-900/5 hover:text-brand-950"
            >
              <Icon name="chevron_right" size={20} />
            </button>
          </div>
        )}

        {/* User pill */}
        <div
          className={cn(
            "mt-4 flex items-center gap-2.5 rounded-lg bg-white/55 px-3 py-2",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? displayName : undefined}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-600/25 bg-brand-500/15 text-[11px] font-bold text-brand-800">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-brand-950">{displayName}</div>
              <div className="text-[10px] text-brand-900/55">Administrator</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-brand-900/45">
            Navigation
          </p>
        )}
        {ADMIN_NAV.map(({ href, icon, label }) => {
          const active =
            pathname === href ||
            (href !== "/admin" && pathname.startsWith(`${href}/`));
          const badge = badgeFor(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "group relative flex items-center rounded-lg text-[13px] transition-colors",
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-brand-700 font-semibold text-white shadow-sm"
                  : "text-brand-900/75 hover:bg-brand-900/5 hover:text-brand-950"
              )}
            >
              {/* Left accent bar for the active item */}
              {active && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white",
                    collapsed ? "left-0" : "left-0"
                  )}
                />
              )}
              <span className="relative shrink-0">
                <Icon
                  name={icon}
                  size={18}
                  className={cn(active ? "text-white" : "text-brand-900/60 group-hover:text-brand-950")}
                />
                {/* Collapsed mode surfaces the count as a small dot on the icon. */}
                {collapsed && badge > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white" />
                )}
              </span>
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && badge > 0 && (
                <span className="ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
              {!collapsed && active && badge === 0 && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-brand-900/10 p-3">
        <button
          type="button"
          onClick={() => void handleLogout()}
          aria-label="Log Out"
          title={collapsed ? "Log Out" : undefined}
          className={cn(
            "flex w-full items-center rounded-lg text-[13px] text-brand-900/65 transition-colors hover:bg-danger/10 hover:text-red-600",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
          )}
        >
          <Icon name="logout" size={18} className="shrink-0" />
          {!collapsed && <span>Log Out</span>}
        </button>
        <div className={cn("px-3 pt-1", collapsed && "flex justify-center px-0")}>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
            {!collapsed && (
              <span className="text-[10px] text-brand-900/50">System Online · v2.4</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminSidebar({ open = false, onClose }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Read the persisted preference after mount (never during the first render)
  // so the server/client markup stays identical and there is no hydration flash.
  // This intentionally syncs an external system (localStorage) -> setState.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Lock body scroll while the mobile drawer is open.
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
      {/* Desktop rail — always visible from lg up, collapses to an icon strip. */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-y-auto transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-[76px]" : "w-[240px]"
        )}
      >
        <SidebarBody collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </aside>

      {/* Mobile slide-in drawer — always full width / expanded. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
          <div
            className="absolute left-0 top-0 h-full w-[260px] max-w-[85%] shadow-lg"
            style={{ animation: "wg-drawer-in 0.28s var(--ease-out) both" }}
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation menu"
          >
            <SidebarBody onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
