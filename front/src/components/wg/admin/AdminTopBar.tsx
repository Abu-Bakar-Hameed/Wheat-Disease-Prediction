
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { adminTitleForPath } from "@/lib/adminNav";
import { NotificationBell } from "../NotificationBell";
import { IconButton } from "@/components/wg/ui";

export interface AdminTopBarProps {
  /** Opens the mobile navigation drawer (hidden on desktop). */
  onMenuClick?: () => void;
}

export function AdminTopBar({ onMenuClick }: AdminTopBarProps) {
  const { displayName, initials, signOut } = useAuth();
  const pathname = usePathname();

  const [adminOpen, setAdminOpen] = useState(false);

  const { title, subtitle } = adminTitleForPath(pathname);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {}

    window.location.href = "/";
  };

  return (
    <header className="flex h-[64px] shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 shadow-sm sm:px-6">

      {/* Left: mobile menu + page title */}
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          icon="menu"
          label="Open navigation menu"
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={onMenuClick}
        />
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-bold text-ink leading-tight">
            {title}
          </h1>

          <p className="hidden text-[11px] text-muted leading-tight sm:block">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">

        {/* Notification bell — real, data-driven (auth service notifications) */}
        <NotificationBell />

        {/* System Administrator Dropdown */}
        <div className="relative pl-3 border-l border-line">

          <button
            onClick={() => setAdminOpen((v) => !v)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-muted transition-colors"
          >

            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-brand-900 text-white flex items-center justify-center text-[12px] font-bold ring-2 ring-brand-100">
              {initials}
            </div>

            {/* User information */}
            <div className="hidden sm:block text-left">
              <div className="text-[13px] font-semibold text-ink leading-tight">
                {displayName}
              </div>

              <div className="text-[11px] text-muted leading-tight">
                System Administrator
              </div>
            </div>

            {/* Dropdown arrow */}
            <span
              className="material-symbols-outlined text-muted"
              style={{ fontSize: 18 }}
            >
              {adminOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
            </span>
          </button>

          {/* Dropdown menu */}
          {adminOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAdminOpen(false)}
              />

              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-line rounded-xl shadow-lg z-50 overflow-hidden">

                {/* Header */}
                <div className="px-4 py-3 border-b border-line">
                  <p className="text-[13px] font-semibold text-ink">
                    {displayName}
                  </p>

                  <p className="text-[11px] text-muted mt-0.5">
                    System Administrator
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-line" />

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-[13px] text-danger hover:bg-danger-soft transition-colors"
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 19 }}
                  >
                    logout
                  </span>

                  <span>Log Out</span>
                </button>

              </div>
            </>
          )}
        </div>

      </div>
    </header>
  );
}
