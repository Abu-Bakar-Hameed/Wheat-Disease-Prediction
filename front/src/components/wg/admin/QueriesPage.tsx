"use client";

/**
 * QueriesPage — admin Query / Support console.
 *
 * Summary cards + searchable/filterable table of user support queries, and a
 * right-side detail drawer that renders the full conversation (including admin
 * internal notes, which are never shown to users), lets an admin reply, change
 * status / priority, assign to an admin, and add internal notes.
 *
 * Reuses the shared admin UI primitives from ./ui.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AssignableAdmin, SupportStatus, SupportPriority,
} from "@/types";
import { SUPPORT_CATEGORIES } from "@/types";
import {
  adminAddNote, adminAssignableAdmins, adminGetQuery, adminListQueries,
  adminQueryStats, adminReplyToQuery, adminUpdateQuery,
} from "@/lib/supportApi";
import { SearchBar, Sk, useLoad } from "./ui";
import { SelectMenu } from "@/components/wg/ui";

const STATUS_META: Record<SupportStatus, { label: string; cls: string }> = {
  new:           { label: "New",            cls: "bg-info-soft text-[#1e40af] dark:text-blue-300" },
  open:          { label: "Open",           cls: "bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" },
  waiting_user:  { label: "Waiting on user", cls: "bg-warning-soft text-[#b45309] dark:text-amber-300" },
  waiting_admin: { label: "Waiting on admin", cls: "bg-[#e0e7ff] text-[#4338ca] dark:bg-indigo-950/40 dark:text-indigo-300" },
  resolved:      { label: "Resolved",       cls: "bg-surface-muted text-ink" },
  closed:        { label: "Closed",         cls: "bg-surface-muted text-muted" },
};

const PRIORITY_META: Record<SupportPriority, { label: string; cls: string }> = {
  low:      { label: "Low",      cls: "bg-surface-muted text-muted" },
  medium:   { label: "Medium",   cls: "bg-[#fef9c3] text-wheat-700" },
  high:     { label: "High",     cls: "bg-[#ffedd5] text-[#c2410c]" },
  critical: { label: "Critical", cls: "bg-danger-soft text-danger" },
};

const LIMIT = 12;

function StatusPill({ status }: { status: SupportStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.open;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}
function PriorityPill({ priority }: { priority: SupportPriority }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}

function dateShort(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}
function timeFull(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function QueriesPage() {
  const [page, setPage] = useState(1);

  // filters
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [assigned, setAssigned] = useState<string>("");
  const [sort, setSort] = useState<string>("last_message_at");

  // detail
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statsLoad = useLoad(() => adminQueryStats(), [], "admin:q:stats");
  const adminsLoad = useLoad(() => adminAssignableAdmins(), [], "admin:q:admins");
  const listLoad = useLoad(
    () => adminListQueries({
      search: q, status: status as SupportStatus | "", priority: priority as SupportPriority | "",
      category, assigned_admin: assigned, sort, page, limit: LIMIT,
    }),
    [q, status, priority, category, assigned, sort, page],
    `admin:q:list:${status}|${priority}|${category}|${assigned}|${sort}|${page}|${q}`
  );

  const stats = statsLoad.data;
  const admins = adminsLoad.data ?? [];
  const rows = listLoad.data?.queries ?? [];
  const total = listLoad.data?.total ?? 0;
  const loading = listLoad.loading;
  const error = listLoad.error;

  const doSearch = () => { setPage(1); setQ(search.trim()); };

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const onDetailChanged = () => { listLoad.reload(); statsLoad.reload(); };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total" value={stats?.total} icon="summarize" tone="text-brand-900" />
        <StatCard label="New" value={stats?.new} icon="fiber_new" tone="text-[#1e40af]" />
        <StatCard label="Open" value={stats?.open} icon="mark_chat_unread" tone="text-brand-700" />
        <StatCard label="Waiting (you)" value={stats?.waiting_admin} icon="hourglass_top" tone="text-[#4338ca]" />
        <StatCard label="Resolved" value={stats?.resolved} icon="task_alt" tone="text-ink" />
        <StatCard label="Closed" value={stats?.closed} icon="lock" tone="text-muted" />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-line p-3.5 shadow-sm flex flex-col lg:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Search ticket, name, email, subject…" />
          <button onClick={doSearch} className="px-3 py-2 rounded-lg border border-line text-[13px] bg-white hover:bg-surface-muted transition-colors shrink-0">
            Search
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <SelectMenu
            ariaLabel="Filter by status"
            className="w-full sm:w-44"
            value={status}
            onChange={(v) => { setPage(1); setStatus(v); }}
            options={[
              { value: "", label: "All statuses" },
              ...Object.entries(STATUS_META).map(([k, val]) => ({ value: k, label: val.label })),
            ]}
          />
          <SelectMenu
            ariaLabel="Filter by priority"
            className="w-full sm:w-44"
            value={priority}
            onChange={(v) => { setPage(1); setPriority(v); }}
            options={[
              { value: "", label: "All priorities" },
              ...Object.entries(PRIORITY_META).map(([k, val]) => ({ value: k, label: val.label })),
            ]}
          />
          <SelectMenu
            ariaLabel="Filter by category"
            className="w-full sm:w-44"
            value={category}
            onChange={(v) => { setPage(1); setCategory(v); }}
            options={[
              { value: "", label: "All categories" },
              ...SUPPORT_CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
          />
          <SelectMenu
            ariaLabel="Filter by assignee"
            className="w-full sm:w-44"
            value={assigned}
            onChange={(v) => { setPage(1); setAssigned(v); }}
            options={[
              { value: "", label: "Any assignee" },
              ...admins.map((a) => ({ value: a.id, label: a.name || a.email })),
            ]}
          />
          <SelectMenu
            ariaLabel="Sort by"
            className="w-full sm:w-44"
            value={sort}
            onChange={(v) => { setPage(1); setSort(v); }}
            options={[
              { value: "last_message_at", label: "Latest activity" },
              { value: "created_at", label: "Newest created" },
              { value: "priority", label: "Priority" },
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger-soft text-danger text-[13px] border border-[#fca5a5]">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-line overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] min-w-[860px]">
            <thead className="bg-surface-muted text-muted text-[11px] uppercase">
              <tr>
                {["Ticket", "User", "Subject", "Category", "Status", "Priority", "Assigned", "Last msg", "Created", ""].map((h) => (
                  <th key={h} className="py-3 px-4 font-semibold tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}><td colSpan={10} className="px-4 py-3"><Sk className="h-8" /></td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center">
                    <span className="material-symbols-outlined text-line block mb-2" style={{ fontSize: 40 }}>support_agent</span>
                    <p className="text-muted text-[14px]">No queries match your filters</p>
                  </td>
                </tr>
              ) : rows.map((r) => {
                const assignee = admins.find((a) => a.id === r.assigned_admin_id);
                return (
                  <tr key={r.id} className="hover:bg-surface-muted transition-colors cursor-pointer" onClick={() => setSelectedId(r.id)}>
                    <td className="py-3 px-4 font-bold text-brand-900 whitespace-nowrap">{r.ticket}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-ink truncate max-w-[160px]">{r.user_name || "—"}</div>
                      <div className="text-[11px] text-muted truncate max-w-[160px]">{r.user_email}</div>
                    </td>
                    <td className="py-3 px-4 max-w-[220px]">
                      <span className="font-medium text-ink truncate block">{r.subject}</span>
                      {typeof r.unread_for_user === "number" && r.unread_for_user > 0 && (
                        <span className="text-[10px] text-danger font-semibold">{r.unread_for_user} unread · {r.message_count} msgs</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted whitespace-nowrap">{r.category || "—"}</td>
                    <td className="py-3 px-4"><StatusPill status={r.status} /></td>
                    <td className="py-3 px-4"><PriorityPill priority={r.priority} /></td>
                    <td className="py-3 px-4 text-muted whitespace-nowrap">{assignee ? (assignee.name || assignee.email) : <span className="text-muted">Unassigned</span>}</td>
                    <td className="py-3 px-4 text-muted whitespace-nowrap">{dateShort(r.last_message_at)}</td>
                    <td className="py-3 px-4 text-muted whitespace-nowrap">{dateShort(r.created_at)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-brand-700 font-semibold text-[12px]">
                        View <span className="material-symbols-outlined" style={{ fontSize: 15 }}>chevron_right</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-muted text-[13px]">
          <span className="text-[12px] text-muted">{total} total · page {page} of {pages}</span>
          <div className="flex items-center gap-1.5">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line disabled:opacity-40 hover:bg-surface-muted text-[12px]">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_left</span>Prev
            </button>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line disabled:opacity-40 hover:bg-surface-muted text-[12px]">
              Next<span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {selectedId && (
        <QueryDetailDrawer
          queryId={selectedId}
          admins={admins}
          onClose={() => setSelectedId(null)}
          onChanged={onDetailChanged}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value?: number; icon: string; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-line p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{label}</span>
        <span className={`material-symbols-outlined ${tone}`} style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <div className={`mt-1 text-[24px] font-bold tabular-nums ${tone}`}>{value === undefined ? "—" : value}</div>
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function QueryDetailDrawer({
  queryId, admins, onClose, onChanged,
}: {
  queryId: string;
  admins: AssignableAdmin[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const detail = useLoad(() => adminGetQuery(queryId), [queryId]);
  const query = detail.data?.query ?? null;
  const messages = detail.data?.messages ?? [];
  const loading = detail.loading;

  // Action failures surface here; load errors come from `detail`.
  const [actionErr, setActionErr] = useState("");
  const error = detail.error || actionErr;

  const [reply, setReply] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length]);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", h); };
  }, [onClose]);

  const patch = async (p: { status?: string; priority?: string; assigned_admin_id?: string | null }) => {
    if (!query) return;
    setActionErr("");
    try {
      await adminUpdateQuery(query.id, p);
      detail.reload();
      onChanged();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Update failed.");
    }
  };

  const send = async () => {
    if (!query) return;
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    setActionErr("");
    try {
      if (noteMode) {
        await adminAddNote(query.id, text);
      } else {
        await adminReplyToQuery(query.id, text);
        onChanged();
      }
      setReply("");
      detail.reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  };

  const provider = useMemo(() => {
    const p = (query?.auth_provider || "").toLowerCase();
    if (p.includes("google")) return "Google";
    if (p.includes("micro") || p.includes("azure")) return "Microsoft";
    return "Email / Password";
  }, [query]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute right-0 top-0 h-full w-full max-w-[720px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line bg-brand-900 text-white shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold">{query?.ticket ?? "…"}</span>
              {query && <StatusPill status={query.status} />}
              {query && <PriorityPill priority={query.priority} />}
            </div>
            <p className="text-[14px] font-semibold mt-1 truncate">{query?.subject}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors shrink-0" aria-label="Close">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        {error && <div className="px-5 py-2 bg-danger-soft text-danger text-[12px] shrink-0">{error}</div>}

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Identity + controls */}
          <div className="lg:w-[240px] shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-canvas p-4 overflow-y-auto space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">User</p>
              {loading ? <Sk className="h-10" /> : (
                <div className="space-y-1">
                  <div className="text-[13px] font-semibold text-ink">{query?.user_name || "—"}</div>
                  <div className="text-[12px] text-muted break-all">{query?.user_email}</div>
                  <div className="text-[11px] text-muted inline-flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>badge</span>
                    {provider}
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (query?.user_id) navigator.clipboard?.writeText(query.user_id); }}
                    className="text-[10px] text-brand-700 hover:underline block truncate max-w-full"
                    title={query?.user_id}
                  >
                    ID: {query?.user_id ? `${query.user_id.slice(0, 8)}…` : "—"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">Status</label>
                <SelectMenu
                  ariaLabel="Status"
                  className="w-full"
                  buttonClassName="h-9 text-[12px]"
                  value={query?.status ?? ""}
                  onChange={(v) => patch({ status: v })}
                  options={Object.entries(STATUS_META).map(([k, val]) => ({ value: k, label: val.label }))}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">Priority</label>
                <SelectMenu
                  ariaLabel="Priority"
                  className="w-full"
                  buttonClassName="h-9 text-[12px]"
                  value={query?.priority ?? ""}
                  onChange={(v) => patch({ priority: v })}
                  options={Object.entries(PRIORITY_META).map(([k, val]) => ({ value: k, label: val.label }))}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">Assigned to</label>
                <SelectMenu
                  ariaLabel="Assigned to"
                  className="w-full"
                  buttonClassName="h-9 text-[12px]"
                  value={query?.assigned_admin_id ?? ""}
                  onChange={(v) => patch({ assigned_admin_id: v || null })}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...admins.map((a) => ({ value: a.id, label: a.name || a.email })),
                  ]}
                />
              </div>
              {query?.category && (
                <div>
                  <p className="text-[11px] font-semibold text-ink mb-1">Category</p>
                  <p className="text-[12px] text-muted">{query.category}</p>
                </div>
              )}
            </div>
          </div>

          {/* Conversation */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-muted">
              {loading ? (
                [1, 2, 3].map((i) => <div key={i} className="h-14 rounded-2xl bg-surface-muted animate-pulse w-3/4" />)
              ) : messages.length === 0 ? (
                <p className="text-center text-[13px] text-muted py-8">No messages yet.</p>
              ) : messages.map((m) => {
                const isUser = m.sender_type === "user";
                const internal = m.is_internal;
                return (
                  <div key={m.id} className={`flex ${internal ? "justify-center" : isUser ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] flex flex-col ${internal ? "items-center" : isUser ? "items-start" : "items-end"}`}>
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                          internal
                            ? "bg-warning-soft text-[#7c4a03] dark:text-amber-300 border border-wheat-300 dark:border-amber-900/40 w-full rounded-none"
                            : isUser
                              ? "bg-surface text-ink border border-line rounded-bl-md"
                              : "bg-brand-700 text-white rounded-br-md"
                        }`}
                      >
                        {internal && <span className="block text-[10px] font-bold uppercase tracking-wide mb-1">🔒 Internal note — not visible to user</span>}
                        {!internal && <span className={`block text-[10px] font-bold mb-1 ${isUser ? "text-muted" : "text-brand-200"}`}>{isUser ? (query?.user_name || "User") : "You / Support"}</span>}
                        {m.message}
                      </div>
                      <span className="text-[10px] text-muted mt-1 px-1">{timeFull(m.created_at)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply composer */}
            <div className="p-4 border-t border-line bg-white shrink-0 space-y-2">
              <div className="flex items-center gap-3 text-[12px]">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="radio" name="mode" checked={!noteMode} onChange={() => setNoteMode(false)} />
                  <span className="text-ink font-medium">Reply to user</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="radio" name="mode" checked={noteMode} onChange={() => setNoteMode(true)} />
                  <span className="text-[#b45309] font-medium">Internal note</span>
                </label>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  maxLength={5000}
                  placeholder={noteMode ? "Add a note only your team can see…" : "Write your reply to the user…"}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-line text-[14px] outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10 resize-none max-h-40"
                />
                <button
                  onClick={send}
                  disabled={busy || !reply.trim()}
                  className={`px-4 py-2.5 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50 transition-colors shrink-0 ${noteMode ? "bg-[#b45309] hover:bg-[#92400e]" : "bg-brand-700 hover:bg-brand-800"}`}
                >
                  {busy ? "Sending…" : noteMode ? "Add note" : "Send"}
                </button>
              </div>
              <p className="text-[10px] text-muted">
                Replying notifies the user in-app and (if enabled) by email. Internal notes are never sent to the user.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
