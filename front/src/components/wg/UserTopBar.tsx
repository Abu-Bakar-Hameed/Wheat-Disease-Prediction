"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/appState";
import { useAuth } from "@/lib/auth";
import { dashboardTitleForPath } from "@/lib/dashboardNav";
import { AssistantHeaderButton } from "./assistant/AssistantHeaderButton";
import { SupportHeaderButton } from "./support/SupportHeaderButton";
import { ProfileModal } from "./ProfileModal";
import { SettingsModal } from "./settings/SettingsModal";
import { FeedbackModal } from "./feedback/FeedbackModal";
import { Avatar, Icon, IconButton, MenuDivider, MenuItem } from "@/components/wg/ui";
import { cn } from "@/lib/utils";

export interface UserTopBarProps {
  /** Opens the mobile navigation drawer (hidden on desktop). */
  onMenuClick?: () => void;
}

export function UserTopBar({ onMenuClick }: UserTopBarProps) {
  const { avatarUrl } = useApp();
  const auth = useAuth();
  const pathname = usePathname();

  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const menuTriggerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuTriggerRef.current && !menuTriggerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const title = dashboardTitleForPath(pathname);
  const userName = auth.displayName;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 shadow-xs">
        <div className="flex min-w-0 items-center gap-3">
          {/* Mobile hamburger */}
          <IconButton
            icon="menu"
            label="Open navigation menu"
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={onMenuClick}
          />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-ink sm:text-xl">{title}</h1>
            <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-muted sm:flex">
              <Icon name="home" size={14} />
              <span>Dashboard</span>
              <Icon name="chevron_right" size={14} className="text-muted/60" />
              <span className="truncate font-medium text-ink">{title}</span>
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <SupportHeaderButton />
          <AssistantHeaderButton />

          {/* Account trigger + dropdown */}
          <div ref={menuTriggerRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              className={cn(
                "flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors",
                "hover:bg-surface-muted focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/25"
              )}
            >
              <Avatar src={avatarUrl ?? null} name={userName} size="sm" />
              <div className="hidden text-left xl:block">
                <div className="text-[13px] font-semibold leading-tight text-ink">{userName}</div>
                <div className="text-[11px] text-muted">{auth.affiliation}</div>
              </div>
              <Icon
                name="expand_more"
                size={18}
                className={cn("hidden text-muted transition-transform duration-200 sm:block", menuOpen && "rotate-180")}
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg animate-scale-in"
              >
                <div className="border-b border-line px-4 py-3">
                  <div className="truncate text-[13px] font-semibold text-ink">{userName}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted">{auth.email}</div>
                </div>

                <MenuItem
                  icon="account_circle"
                  onClick={() => {
                    setMenuOpen(false);
                    setProfileOpen(true);
                  }}
                >
                  Profile
                </MenuItem>
                <MenuItem
                  icon="settings"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                >
                  Settings
                </MenuItem>
                <MenuItem
                  icon="rate_review"
                  onClick={() => {
                    setMenuOpen(false);
                    setFeedbackOpen(true);
                  }}
                >
                  Feedback
                </MenuItem>

                <MenuDivider />

                <MenuItem
                  icon="logout"
                  danger
                  onClick={async () => {
                    setMenuOpen(false);
                    try {
                      await auth.signOut();
                    } catch {
                      /* ignore */
                    }
                    window.location.href = "/";
                  }}
                >
                  Log out
                </MenuItem>
              </div>
            )}
          </div>
        </div>
      </header>

      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}
