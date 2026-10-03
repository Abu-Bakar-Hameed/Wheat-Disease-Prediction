"use client";

/**
 * SupportHeaderButton — the header entry point for the Query / Support system.
 *
 * Renders a Material-Symbols icon (matching NotificationBell / ChatbotHeaderButton
 * styling) with a live unread badge, and opens the SupportDrawer. The badge polls
 * the auth service every 60 s and refreshes immediately when the drawer closes
 * (opening a conversation marks admin messages read server-side).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { unreadSupportCount } from "@/lib/supportApi";
import { SupportDrawer } from "./SupportDrawer";

export function SupportHeaderButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    if (!user) return;
    unreadSupportCount().then(setUnread).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const tick = () => { if (document.visibilityState === "visible") refresh(); };
    ref.current = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (ref.current) clearInterval(ref.current);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [user, refresh]);

  if (!user) return null;

  const handleClose = () => {
    setOpen(false);
    refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-10 h-10 rounded-xl text-ink hover:bg-surface-muted hover:text-brand-900 flex items-center justify-center transition-all duration-150"
        aria-label={`Support & queries${unread > 0 ? ` (${unread} unread)` : ""}`}
        title="Support & Queries"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>support_agent</span>
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 ring-2 ring-white shadow-xs">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && <SupportDrawer onClose={handleClose} />}
    </>
  );
}
