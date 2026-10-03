"use client";

/**
 * SupportDrawer — user-side Query / Support panel.
 *
 * A right-side drawer (matching the existing modal/drawer styling) with three
 * views:
 *   list  — the user's queries + a "New Query" button
 *   new   — create-query form (Subject, Category, Your Query) with validation
 *   chat  — the conversation thread with a reply box
 *
 * Identity is attached automatically by the backend from the JWT — the user
 * never types their email. Internal admin notes are never shown here (the
 * API already filters them out).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SupportMessage, SupportQuery, SupportStatus } from "@/types";
import { SUPPORT_CATEGORIES } from "@/types";
import {
  clearQueryMessages,
  createSupportQuery,
  deleteSupportQuery,
  getSupportQuery,
  listMyQueries,
  replyToQuery,
  reopenSupportQuery,
  resolveSupportQuery,
} from "@/lib/supportApi";

type View = "list" | "new" | "chat";

const STATUS_META: Record<SupportStatus, { label: string; cls: string }> = {
  new:           { label: "New",           cls: "bg-info-soft text-[#1e40af] dark:text-blue-300" },
  open:          { label: "Open",          cls: "bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" },
  waiting_user:  { label: "Waiting on you", cls: "bg-warning-soft text-[#b45309] dark:text-amber-300" },
  waiting_admin: { label: "Waiting on us", cls: "bg-[#e0e7ff] text-[#4338ca] dark:bg-indigo-950/40 dark:text-indigo-300" },
  resolved:      { label: "Resolved",      cls: "bg-surface-muted text-ink" },
  closed:        { label: "Closed",        cls: "bg-surface-muted text-muted" },
};

function StatusPill({ status }: { status: SupportStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Three-dot action menu (cards + chat header) ─────────────────────────

interface MenuAction {
  label: string;
  icon: string;
  danger?: boolean;
  separatorBefore?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

function ActionMenu({ actions, ariaLabel = "Query actions" }: { actions: MenuAction[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Items are read from the mounted menu (event-time only, never during
  // render) so keyboard nav survives disabled/separator rows gracefully.
  const menuItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);

  const focusItem = (idx: number) => {
    const items = menuItems();
    if (!items.length) return;
    items[((idx % items.length) + items.length) % items.length]?.focus();
  };

  // Arrow/Home/End navigation + Escape (which also stops the drawer from
  // closing, since the window-level listener checks for an open menu).
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    const items = menuItems();
    const idx = items.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown")      { e.preventDefault(); focusItem(idx < 0 ? 0 : idx + 1); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); focusItem(idx < 0 ? items.length - 1 : idx - 1); }
    else if (e.key === "Home")      { e.preventDefault(); focusItem(0); }
    else if (e.key === "End")       { e.preventDefault(); focusItem(items.length - 1); }
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setTimeout(() => focusItem(0), 0);
          }
        }}
        className="p-1.5 rounded-lg text-muted hover:bg-surface-muted hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-brand-700 transition-colors"
      >
        <span className="material-symbols-outlined block" style={{ fontSize: 18 }}>more_vert</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-line bg-surface shadow-lg py-1.5"
        >
          {actions.map((a) => (
            <div key={a.label}>
              {a.separatorBefore && <div className="my-1.5 border-t border-line" role="separator" />}
              <button
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={() => { setOpen(false); a.onSelect(); }}
                className={`w-full text-left px-3.5 py-2 flex items-center gap-2.5 text-[13px] transition-colors disabled:opacity-50 ${
                  a.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface-muted"
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{a.icon}</span>
                {a.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Confirmation dialog (Clear Messages / Delete Query) ────────────────────

function ConfirmDialog({
  title, lines, confirmLabel, busyLabel, busy, onCancel, onConfirm,
}: {
  title: string;
  lines: string[];
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef   = useRef<HTMLButtonElement>(null);
  const confirmRefB = useRef<HTMLButtonElement>(null);

  // Focus starts on the safe action (Cancel); the destructive button must be
  // reached deliberately. Escape cancels unless a request is in flight.
  useEffect(() => { cancelRef.current?.focus(); }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); if (!busy) onCancel(); return; }
    if (e.key === "Tab") {
      // Minimal focus trap: the dialog only ever holds two tabbable buttons.
      e.preventDefault();
      const next = document.activeElement === confirmRefB.current ? cancelRef : confirmRefB;
      next.current?.focus();
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => { if (!busy) onCancel(); }}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-[340px] bg-surface rounded-2xl border border-line shadow-2xl p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-bold text-ink">{title}</h3>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onCancel}
            className="p-1 rounded-lg text-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          {lines.map((l) => <p key={l} className="text-[13px] leading-relaxed text-muted">{l}</p>)}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-line text-[13px] text-ink hover:bg-surface-muted disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRefB}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger text-white text-[13px] font-semibold hover:bg-danger disabled:opacity-60 transition-colors"
          >
            {busy && <span className="animate-spin material-symbols-outlined" style={{ fontSize: 15 }}>progress_activity</span>}
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SupportDrawer({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>("list");
  const [queries, setQueries] = useState<SupportQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // new-query form
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState("");

  // conversation
  const [active, setActive] = useState<SupportQuery | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // query-management overlays: confirmation dialog, in-flight action, toast
  const [confirmState, setConfirmState] = useState<null | { kind: "delete" | "clear"; query: SupportQuery }>(null);
  const [actionBusy, setActionBusy] = useState<false | "delete" | "clear" | "resolve">(false);
  const [toast, setToast] = useState<null | { kind: "success" | "error"; text: string }>(null);

  const loadList = useCallback(async () => {
    try {
      const qs = await listMyQueries();
      setQueries(qs);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your queries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount via a deferred promise chain so no setState runs
    // synchronously in the effect body (react-hooks/set-state-in-effect).
    let alive = true;
    listMyQueries()
      .then((qs) => { if (alive) { setQueries(qs); setError(""); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load your queries."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Body scroll lock while mounted.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape closes — unless an action menu or confirmation dialog is open;
  // those handle their own Escape and must be dismissed first.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="alertdialog"], [role="menu"]')) return;
      onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Toast auto-dismiss: every showToast() call produces a fresh object, so
  // this effect re-arms on each one (no ref needed during render).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Scroll to the newest message whenever the chat thread changes.
  useEffect(() => {
    if (view !== "chat") return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [view, messages, chatLoading]);

  const openChat = useCallback(async (id: string) => {
    setChatLoading(true);
    setView("chat");
    setReply("");
    setError("");
    try {
      const { query, messages: msgs } = await getSupportQuery(id);
      setActive(query);
      setMessages(msgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversation.");
      setView("list");
    } finally {
      setChatLoading(false);
    }
  }, []);

  const submitNew = async () => {
    setFormErr("");
    const s = subject.trim();
    const b = body.trim();
    if (s.length < 3) { setFormErr("Subject must be at least 3 characters."); return; }
    if (s.length > 150) { setFormErr("Subject must be 150 characters or fewer."); return; }
    if (b.length < 10) { setFormErr("Please describe your query (at least 10 characters)."); return; }
    if (b.length > 5000) { setFormErr("Message must be 5000 characters or fewer."); return; }

    setSubmitting(true);
    try {
      const q = await createSupportQuery(s, b, category || undefined);
      setSubject(""); setCategory(""); setBody("");
      await loadList();
      void openChat(q.id);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Failed to submit your query.");
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!active) return;
    const text = reply.trim();
    if (!text) return;
    setReplyBusy(true);
    setError("");
    try {
      const msg = await replyToQuery(active.id, text);
      setMessages((prev) => [...prev, msg]);
      setReply("");
      setActive((a) => (a ? { ...a, status: a.status === "waiting_user" ? "open" : a.status } : a));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send your reply.");
    } finally {
      setReplyBusy(false);
    }
  };

  const doReopen = async () => {
    if (!active) return;
    setReplyBusy(true);
    try {
      await reopenSupportQuery(active.id);
      await openChat(active.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reopen query.");
    } finally {
      setReplyBusy(false);
    }
  };

  // ── Query management: resolve / clear / delete (spec §1–§6, §18) ────────

  const showToast = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text });
  }, []);

  const isLive = (s: SupportStatus) => ["new", "open", "waiting_user", "waiting_admin"].includes(s);

  const doResolve = async (q: SupportQuery) => {
    if (actionBusy) return; // no duplicate requests while one is in flight
    setActionBusy("resolve");
    try {
      await resolveSupportQuery(q.id);
      setQueries((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: "resolved" as SupportStatus } : x)));
      setActive((a) => (a && a.id === q.id ? { ...a, status: "resolved" as SupportStatus } : a));
      showToast("success", "Query marked as resolved");
    } catch {
      showToast("error", "Unable to resolve this query. Please try again.");
    } finally {
      setActionBusy(false);
    }
  };

  /** Runs the confirmed action only after the backend confirms success. */
  const runConfirm = async () => {
    if (!confirmState || actionBusy) return;
    const { kind, query: q } = confirmState;
    setActionBusy(kind);
    try {
      if (kind === "clear") {
        await clearQueryMessages(q.id);
        setQueries((prev) => prev.map((x) =>
          x.id === q.id ? { ...x, message_count: 0, unread_for_user: 0 } : x
        ));
        if (active?.id === q.id) setMessages([]);
        showToast("success", "Messages cleared successfully");
      } else {
        await deleteSupportQuery(q.id);
        setQueries((prev) => prev.filter((x) => x.id !== q.id));
        if (active?.id === q.id) { setActive(null); setMessages([]); setView("list"); }
        showToast("success", "Query deleted successfully");
      }
    } catch {
      // Backend failed — the item stays in the UI untouched (spec §17).
      showToast("error", kind === "clear"
        ? "Unable to clear messages. Please try again."
        : "Unable to delete this query. Please try again.");
    } finally {
      setConfirmState(null);
      setActionBusy(false);
    }
  };

  const manageActionsFor = (q: SupportQuery): MenuAction[] => {
    const acts: MenuAction[] = [];
    if (isLive(q.status)) {
      acts.push({ label: "Mark as Resolved", icon: "task_alt", disabled: actionBusy !== false, onSelect: () => void doResolve(q) });
    }
    acts.push({ label: "Clear Messages", icon: "clear_all", disabled: actionBusy !== false, onSelect: () => setConfirmState({ kind: "clear", query: q }) });
    acts.push({ label: "Delete Query", icon: "delete", danger: true, separatorBefore: true, disabled: actionBusy !== false, onSelect: () => setConfirmState({ kind: "delete", query: q }) });
    return acts;
  };

  const cardActionsFor = (q: SupportQuery): MenuAction[] => [
    { label: "View Query", icon: "visibility", onSelect: () => void openChat(q.id) },
    ...manageActionsFor(q),
  ];

  const canReply = active ? ["new", "open", "waiting_user"].includes(active.status) : false;
  const isClosed = active ? ["resolved", "closed"].includes(active.status) : false;

  // Portal to <body>: the trigger lives inside the top bar, whose
  // `backdrop-blur` (backdrop-filter) would otherwise become the containing
  // block for this `position: fixed` overlay and collapse it to the header box.
  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Support & queries"
        className="absolute right-0 top-0 h-full w-full max-w-[460px] bg-surface shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-canvas shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-900 text-white flex items-center justify-center">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>support_agent</span>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-brand-900 leading-tight">
                {view === "chat" ? "Your query" : view === "new" ? "New query" : "Support & Queries"}
              </h2>
              {view === "chat" && active && (
                <p className="text-[11px] text-muted">Ticket {active.ticket}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {view === "chat" && (
              <button
                onClick={() => { setView("list"); setActive(null); }}
                className="p-2 rounded-lg text-muted hover:bg-surface-muted hover:text-brand-900 transition-colors"
                title="Back to list"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted hover:bg-surface-muted hover:text-ink transition-colors"
              aria-label="Close"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>
        </div>

        {/* Error banner. An empty-list load error is shown inline in the body
            below instead, so we avoid rendering it twice. */}
        {error && !(view === "list" && !loading && queries.length === 0) && (
          <div className="px-5 py-2.5 bg-danger-soft text-danger text-[12px] border-b border-[#fca5a5] dark:border-red-800/50 shrink-0">
            {error}
          </div>
        )}

        {/* ── LIST ───────────────────────────────────────────────── */}
        {view === "list" && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-5">
              <button
                onClick={() => setView("new")}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-700 text-white text-[13px] font-semibold hover:bg-brand-800 transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                New Query
              </button>
            </div>

            {loading ? (
              <div className="px-5 space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-surface-muted animate-pulse" />)}
              </div>
            ) : queries.length === 0 ? (
              error ? (
                <div className="px-6 text-center py-10">
                  <div className="w-14 h-14 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto mb-3">
                    <span className="material-symbols-outlined" style={{ fontSize: 28 }}>error_outline</span>
                  </div>
                  <p className="text-[14px] font-semibold text-ink">Couldn&apos;t load your queries</p>
                  <p className="text-[12px] text-muted mt-1 max-w-[260px] mx-auto">{error}</p>
                  <button
                    onClick={() => { setError(""); setLoading(true); void loadList(); }}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line text-[13px] text-ink hover:bg-surface-muted transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                    Try again
                  </button>
                </div>
              ) : (
                <div className="px-6 text-center py-10">
                  <div className="w-14 h-14 rounded-full bg-surface-muted text-muted flex items-center justify-center mx-auto mb-3">
                    <span className="material-symbols-outlined" style={{ fontSize: 28 }}>chat_bubble</span>
                  </div>
                  <p className="text-[14px] font-semibold text-ink">No support queries yet</p>
                  <p className="text-[12px] text-muted mt-1 max-w-[260px] mx-auto">
                    Create a query if you need help or want to report an issue.
                  </p>
                  <button
                    onClick={() => setView("new")}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-700 text-white text-[13px] font-semibold hover:bg-brand-800 transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                    New Query
                  </button>
                </div>
              )
            ) : (
              <div className="px-5 pb-5 space-y-2.5">
                {queries.map((q) => (
                  <div
                    key={q.id}
                    className="relative bg-surface border border-line rounded-xl hover:border-brand-700 hover:shadow-sm transition-all group"
                  >
                    <button
                      onClick={() => void openChat(q.id)}
                      className="w-full text-left p-3.5 pr-12"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-bold text-muted">{q.ticket}</span>
                        <StatusPill status={q.status} />
                        {(q.unread_for_user ?? 0) > 0 && (
                          <span className="min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                            {q.unread_for_user}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] font-semibold text-ink truncate">{q.subject}</p>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-[11px] text-muted truncate">
                          {q.category ? `${q.category} · ` : ""}{q.message_count ?? 0} message{(q.message_count ?? 0) === 1 ? "" : "s"}
                        </p>
                        <span className="text-[10px] text-muted shrink-0 group-hover:text-brand-700 transition-colors">
                          {relativeTime(q.last_message_at)}
                        </span>
                      </div>
                    </button>
                    {/* Query management: view / resolve / clear / delete */}
                    <div className="absolute top-1.5 right-1.5">
                      <ActionMenu actions={cardActionsFor(q)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NEW ────────────────────────────────────────────────── */}
        {view === "new" && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-ink mb-1.5">Subject <span className="text-danger">*</span></label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={150}
                  placeholder="Brief summary of your issue"
                  className="w-full px-3 py-2.5 rounded-lg border border-line text-[14px] outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10"
                />
                <p className="text-[10px] text-muted mt-1 text-right">{subject.trim().length}/150</p>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-ink mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-line text-[14px] outline-none focus:border-brand-700 bg-surface"
                >
                  <option value="">Select a category (optional)</option>
                  {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-ink mb-1.5">Your Query <span className="text-danger">*</span></label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={7}
                  maxLength={5000}
                  placeholder="Describe your issue in detail. Our support team will reply here and by email."
                  className="w-full px-3 py-2.5 rounded-lg border border-line text-[14px] outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10 resize-y"
                />
                <p className="text-[10px] text-muted mt-1 text-right">{body.trim().length}/5000</p>
              </div>

              <p className="text-[11px] text-muted bg-surface-muted rounded-lg px-3 py-2 flex items-start gap-1.5">
                <span className="material-symbols-outlined text-brand-700" style={{ fontSize: 15 }}>info</span>
                We&apos;ll attach your account details automatically — you don&apos;t need to enter your email.
              </p>

              {formErr && <p className="text-[12px] text-danger">{formErr}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setView("list"); setFormErr(""); }}
                  className="px-4 py-2.5 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitNew}
                  disabled={submitting || subject.trim().length < 3 || body.trim().length < 10}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold hover:bg-brand-800 disabled:opacity-50 transition-colors"
                >
                  {submitting ? (
                    <><span className="animate-spin material-symbols-outlined" style={{ fontSize: 16 }}>progress_activity</span>Sending…</>
                  ) : (
                    <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>Submit Query</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CHAT ───────────────────────────────────────────────── */}
        {view === "chat" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {active && (
              <div className="px-5 py-3 border-b border-line shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink truncate">{active.subject}</p>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <StatusPill status={active.status} />
                    {/* Manage the open query without going back to the list */}
                    <ActionMenu actions={manageActionsFor(active)} />
                  </div>
                </div>
                {active.category && <p className="text-[11px] text-muted mt-0.5">{active.category}</p>}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-canvas">
              {chatLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <div key={i} className="h-14 rounded-2xl bg-surface-muted animate-pulse w-3/4" />)}
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-10 px-6">
                  <div className="w-14 h-14 rounded-full bg-surface-muted text-muted flex items-center justify-center mx-auto mb-3">
                    <span className="material-symbols-outlined" style={{ fontSize: 28 }}>chat_bubble</span>
                  </div>
                  <p className="text-[14px] font-semibold text-ink">No messages yet</p>
                  <p className="text-[12px] text-muted mt-1">Your messages for this query will appear here.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_type === "user";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                            mine
                              ? "bg-brand-700 text-white rounded-br-md"
                              : "bg-surface text-ink border border-line rounded-bl-md"
                          }`}
                        >
                          {!mine && (
                            <span className="block text-[10px] font-bold text-brand-700 mb-1">WheatGuard Support</span>
                          )}
                          {m.message}
                        </div>
                        <span className="text-[10px] text-muted mt-1 px-1">{timeLabel(m.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply / closed actions */}
            <div className="p-4 border-t border-line bg-surface shrink-0">
              {isClosed ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] text-muted text-center">
                    This query is {active?.status === "closed" ? "closed" : "resolved"}. Reopen it to continue, or start a new one.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setView("list"); setActive(null); setView("new"); }}
                      className="flex-1 px-3 py-2.5 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors"
                    >
                      New Query
                    </button>
                    <button
                      onClick={doReopen}
                      disabled={replyBusy}
                      className="flex-1 px-3 py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold hover:bg-brand-800 disabled:opacity-50 transition-colors"
                    >
                      {replyBusy ? "Reopening…" : "Reopen Query"}
                    </button>
                  </div>
                </div>
              ) : canReply ? (
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={1}
                    maxLength={5000}
                    placeholder="Type your reply…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendReply(); }
                    }}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-line text-[14px] outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10 resize-none max-h-32"
                  />
                  <button
                    onClick={sendReply}
                    disabled={replyBusy || !reply.trim()}
                    className="p-2.5 rounded-xl bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 transition-colors shrink-0"
                    aria-label="Send reply"
                  >
                    <span className="material-symbols-outlined block" style={{ fontSize: 20 }}>{replyBusy ? "progress_activity" : "send"}</span>
                  </button>
                </div>
              ) : (
                <p className="text-[12px] text-muted text-center">
                  Waiting for our team to respond. You&apos;ll be able to reply once they do.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Small toast for resolve/clear/delete outcomes (spec §16) */}
        {toast && (
          <div
            role="status"
            className={`absolute bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-[12.5px] font-semibold whitespace-nowrap text-white ${
              toast.kind === "success" ? "bg-brand-900" : "bg-danger"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {toast.kind === "success" ? "check_circle" : "error"}
            </span>
            {toast.text}
          </div>
        )}

        {/* Clear / Delete confirmation — the two flows stay visually distinct */}
        {confirmState && (
          <ConfirmDialog
            title={confirmState.kind === "delete" ? "Delete this query?" : "Clear messages?"}
            lines={
              confirmState.kind === "delete"
                ? [
                    `This will permanently delete ${confirmState.query.ticket} and its messages.`,
                    "This action cannot be undone.",
                  ]
                : [
                    "This will remove all messages from this query but keep the query itself.",
                    `You can still open ${confirmState.query.ticket} and continue the conversation.`,
                  ]
            }
            confirmLabel={confirmState.kind === "delete" ? "Delete Query" : "Clear Messages"}
            busyLabel={confirmState.kind === "delete" ? "Deleting…" : "Clearing…"}
            busy={actionBusy === "delete" || actionBusy === "clear"}
            onCancel={() => setConfirmState(null)}
            onConfirm={() => void runConfirm()}
          />
        )}
      </aside>
    </div>,
    document.body
  );
}
