"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationItem,
  clearAllNotifications,
  recordActivityEvent,
} from "@/lib/api";
import type { NotificationItem } from "@/types";
import { ASSISTANT_REPLIED_EVENT } from "./assistant/assistantEvents";
import { useRouter } from "next/navigation";

const TYPE_CONFIG: Record<string, { dot: string; icon: string }> = {
  prediction: { dot: "bg-danger", icon: "coronavirus" },
  weather:    { dot: "bg-warning", icon: "thunderstorm" },
  report:     { dot: "bg-info", icon: "description" },
  system:     { dot: "bg-muted", icon: "info" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<
    { top: number; right: number; width: number; maxHeight: number } | null
  >(null);

  // The bell is not at the far-right of the bar (the avatar sits beside it), so a
  // right-anchored panel can overflow the LEFT viewport edge on narrow screens and
  // clip its title. Measure against the bell and clamp so the panel always fits.
  const measure = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const width = Math.min(384, vw - margin * 2);
    let right = vw - rect.right;
    if (vw - right - width < margin) right = vw - margin - width;
    const top = rect.bottom + 8;
    const maxHeight = Math.max(240, Math.min(480, vh - top - margin));
    setCoords({ top, right, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onReflow = () => measure();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, measure]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const refreshCount = () => {
    if (!user) return;
    fetchUnreadCount()
      .then(r => setUnreadCount(r.unread ?? r.count ?? 0))
      .catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    refreshCount();

    const tick = () => {
      if (document.visibilityState === "visible") refreshCount();
    };

    // The assistant's notification row is written before the chat response is
    // returned, so the panel can tell us to refresh right away rather than
    // waiting up to a minute for the next poll.
    const onAssistantReplied = () => refreshCount();

    intervalRef.current = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener(ASSISTANT_REPLIED_EVENT, onAssistantReplied);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener(ASSISTANT_REPLIED_EVENT, onAssistantReplied);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleOpen = () => {
    setOpen(v => !v);
    if (!open && user) {
      setLoading(true);
      setError("");
      // Record "notification_viewed" once per open (best-effort).
      void recordActivityEvent("notification_viewed");
      fetchNotifications(20)
        .then(r => { setItems(r.items ?? r.notifications ?? []); setUnreadCount(r.unread ?? 0); })
        .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
        .finally(() => setLoading(false));
    }
  };

  const handleClick = (item: NotificationItem) => {
    // Record "notification_clicked" (best-effort) before navigating away.
    void recordActivityEvent("notification_clicked", {
      metadata: { notification_id: item.id, type: item.type },
    });
    if (!item.read) {
      markNotificationRead(item.id).catch(() => {});
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (item.link) router.push(item.link);
  };

  const handleMarkAll = () => {
    markAllNotificationsRead().catch(() => {});
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  // Delete one notification. Removes it from the UI only after the backend
  // confirms success; a failure leaves the row in place and is surfaced.
  const handleDelete = async (item: NotificationItem) => {
    if (deletingId) return; // one delete request at a time
    setDeletingId(item.id);
    try {
      await deleteNotificationItem(item.id);
      setItems(prev => prev.filter(n => n.id !== item.id));
      if (!item.read) setUnreadCount(c => Math.max(0, c - 1));
    } catch {
      setError("Couldn't delete this notification. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // Delete every notification after an explicit confirmation. Nothing is
  // cleared from the UI unless the backend confirms.
  const handleClearAll = async () => {
    if (deletingId === "__all__") return;
    if (!window.confirm("Clear all notifications? This cannot be undone.")) return;
    setDeletingId("__all__");
    try {
      await clearAllNotifications();
      setItems([]);
      setUnreadCount(0);
    } catch {
      setError("Couldn't clear notifications. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="relative w-10 h-10 rounded-xl text-ink hover:bg-[#F4F6F5] hover:text-brand-900 flex items-center justify-center transition-all duration-150"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 ring-2 ring-white shadow-xs">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && coords && typeof document !== "undefined" &&
        createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            style={{ position: "fixed", top: coords.top, right: coords.right, width: coords.width, maxHeight: coords.maxHeight }}
            className="z-[80] flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-line bg-canvas shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-brand-900 dark:text-brand-300" style={{ fontSize: 20 }}>notifications</span>
                <span className="text-[14px] font-bold text-brand-900 dark:text-brand-200">Notifications</span>
              </div>
              {unreadCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-danger-soft text-[#991b1b] dark:text-red-300 text-[11px] font-bold">
                  {unreadCount} Unread
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-surface-muted">
              {loading ? (
                <div className="py-12 flex justify-center items-center gap-2 text-muted">
                  <span className="animate-spin material-symbols-outlined text-brand-900 dark:text-brand-300" style={{ fontSize: 24 }}>
                    progress_activity
                  </span>
                  <span className="text-[13px]">Loading notifications…</span>
                </div>
              ) : error ? (
                <div className="py-8 px-4 text-center text-[13px] text-danger">{error}</div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-surface-muted text-muted flex items-center justify-center mx-auto mb-2">
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
                      notifications_off
                    </span>
                  </div>
                  <p className="text-[13px] font-medium text-ink">No notifications yet</p>
                  <p className="text-[11px] text-muted mt-0.5">We&apos;ll alert you here when new disease risks or reports arrive.</p>
                </div>
              ) : (
                items.map(item => {
                  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.system;
                  return (
                    <div
                      key={item.id}
                      className={`group relative flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted ${
                        !item.read ? "bg-brand-50 dark:bg-brand-950/40" : ""
                      }`}
                    >
                      <button
                        onClick={() => handleClick(item)}
                        className="flex flex-1 items-start gap-3 text-left pr-7 min-w-0"
                      >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] leading-snug ${!item.read ? "font-bold text-ink" : "font-medium text-ink"}`}>
                            {item.title}
                          </div>
                          <div className="text-[12px] text-muted mt-0.5 leading-normal line-clamp-2">{item.body}</div>
                        </div>
                      </button>
                      <span className="text-[10px] text-muted shrink-0 mt-0.5 font-medium group-hover:opacity-0 transition-opacity pointer-events-none max-sm:hidden">
                        {relativeTime(item.created_at)}
                      </span>
                      <button
                        onClick={() => void handleDelete(item)}
                        disabled={deletingId === item.id}
                        aria-label="Delete notification"
                        className="absolute right-2.5 top-2.5 flex w-7 h-7 rounded-lg items-center justify-center text-muted opacity-100 hover:bg-danger-soft hover:text-danger transition-all disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          {deletingId === item.id ? "progress_activity" : "delete"}
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {items.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-line bg-canvas shrink-0">
                <button
                  onClick={handleMarkAll}
                  className="text-[12px] text-brand-700 dark:text-brand-300 font-bold hover:text-brand-900 dark:hover:text-brand-200 hover:underline transition-colors"
                >
                  Mark all as read
                </button>
                <button
                  onClick={() => void handleClearAll()}
                  disabled={deletingId === "__all__"}
                  className="inline-flex items-center gap-1 text-[12px] text-muted font-bold hover:text-danger transition-colors disabled:opacity-60"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    {deletingId === "__all__" ? "progress_activity" : "delete_sweep"}
                  </span>
                  Clear all
                </button>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
