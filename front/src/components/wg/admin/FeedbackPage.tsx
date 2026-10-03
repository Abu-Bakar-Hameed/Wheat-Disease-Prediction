"use client";

/**
 * FeedbackPage — admin Feedback console (/admin/feedback).
 *
 * Summary cards + a searchable/filterable/paginated table of user feedback and
 * a right-side detail drawer for triage: change status / priority, assign,
 * reply to the user (visible) or add an internal note (hidden), and read the
 * chatbot context (provider / model / conversation / message id) when present.
 * Also hosts the Analytics view and the automatic-prompt Settings editor.
 *
 * Reuses the shared admin UI primitives from ./ui and the user-side star
 * display from the feedback form.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  AssignableAdmin, FeedbackPriority, FeedbackStatus, FeedbackSettings,
} from "@/types";
import { FEEDBACK_TYPES } from "@/types";
import {
  adminAssignableFeedbackAdmins, adminDeleteFeedback,
  adminFeedbackStats, adminGetFeedback,
  adminGetFeedbackSettings, adminListFeedback,
  adminUpdateFeedbackSettings,
  type AdminFeedbackDetail,
} from "@/lib/feedbackApi";
import {
  inputCls, SearchBar, Sk, useLoad, ModalShell, PrimaryBtn, ConfirmModal,
} from "./ui";
import { RatingInline } from "@/components/wg/feedback/FeedbackForm";
import { SelectMenu } from "@/components/wg/ui";
import { FeedbackAnalyticsPanel } from "./FeedbackAnalytics";

const STATUS_META: Record<FeedbackStatus, { label: string; cls: string }> = {
  new:          { label: "New",         cls: "bg-info-soft text-[#1e40af] dark:text-blue-300" },
  under_review: { label: "Under Review", cls: "bg-[#e0e7ff] text-[#4338ca] dark:bg-indigo-950/40 dark:text-indigo-300" },
  in_progress:  { label: "In Progress", cls: "bg-warning-soft text-[#b45309] dark:text-amber-300" },
  resolved:     { label: "Resolved",    cls: "bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" },
  closed:       { label: "Closed",      cls: "bg-surface-muted text-muted" },
};
const PRIORITY_META: Record<FeedbackPriority, { label: string; cls: string }> = {
  low:      { label: "Low",      cls: "bg-surface-muted text-muted" },
  medium:   { label: "Medium",   cls: "bg-[#fef9c3] text-wheat-700" },
  high:     { label: "High",     cls: "bg-[#ffedd5] text-[#c2410c]" },
  critical: { label: "Critical", cls: "bg-danger-soft text-danger" },
};

const LIMIT = 12;

function StatusPill({ status }: { status: FeedbackStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.new;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}
function PriorityPill({ priority }: { priority: FeedbackPriority }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}
function dateShort(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

export function FeedbackPage() {
  const [tab, setTab] = useState<"inbox" | "analytics">("inbox");
  const [page, setPage] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [rating, setRating] = useState("");
  const [assigned, setAssigned] = useState("");
  const [sort, setSort] = useState("created_at");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statsLoad = useLoad(() => adminFeedbackStats(), [], "admin:fb:stats");
  const adminsLoad = useLoad(() => adminAssignableFeedbackAdmins(), [], "admin:fb:admins");
  const listLoad = useLoad(
    () => adminListFeedback({
      search: q, status: status as FeedbackStatus | "", type, priority: priority as FeedbackPriority | "",
      rating: rating ? Number(rating) : "", assigned_admin: assigned, sort, page, limit: LIMIT,
    }),
    [q, status, type, priority, rating, assigned, sort, page],
    `admin:fb:list:${status}|${type}|${priority}|${rating}|${assigned}|${sort}|${page}|${q}`
  );

  const stats = statsLoad.data;
  const admins = adminsLoad.data ?? [];
  const rows = listLoad.data?.feedback ?? [];
  const total = listLoad.data?.total ?? 0;
  const loading = listLoad.loading && tab === "inbox";
  const error = listLoad.error;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const doSearch = () => { setPage(1); setQ(search.trim()); };
  const onChanged = () => { listLoad.reload(); statsLoad.reload(); };

  return (
    <div className="space-y-4">
      {/* Header + tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-white rounded-xl border border-line p-1 shadow-sm">
          {(["inbox", "analytics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold capitalize transition-colors ${
                tab === t ? "bg-brand-700 text-white" : "text-muted hover:bg-surface-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line bg-white text-[13px] text-ink hover:bg-surface-muted transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>tune</span>
            Prompt settings
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats?.total} icon="reviews" tone="text-brand-900" />
        <StatCard label="New" value={stats?.new} icon="fiber_new" tone="text-[#1e40af]" />
        <StatCard label="In Progress" value={stats ? stats.under_review + stats.in_progress : undefined} icon="pending" tone="text-[#b45309]" />
        <StatCard label="Resolved" value={stats?.resolved} icon="task_alt" tone="text-brand-700" />
        <StatCard label="Avg Rating" value={stats ? stats.avg_rating.toFixed(1) : undefined} icon="star" tone="text-[#f59e0b]" suffix={stats ? `/5` : undefined} />
      </div>

      {tab === "inbox" ? (
        <>
          {/* Toolbar */}
          <div className="bg-white rounded-xl border border-line p-3.5 shadow-sm flex flex-col lg:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <SearchBar value={search} onChange={setSearch} placeholder="Search ID, user, email, message…" />
              <button onClick={doSearch} className="px-3 py-2 rounded-lg border border-line text-[13px] bg-white hover:bg-surface-muted transition-colors shrink-0">
                Search
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <SelectMenu
                ariaLabel="Filter by status"
                className="w-full sm:w-40"
                value={status}
                onChange={(v) => { setPage(1); setStatus(v); }}
                options={[
                  { value: "", label: "All statuses" },
                  ...Object.entries(STATUS_META).map(([k, val]) => ({ value: k, label: val.label })),
                ]}
              />
              <SelectMenu
                ariaLabel="Filter by type"
                className="w-full sm:w-40"
                value={type}
                onChange={(v) => { setPage(1); setType(v); }}
                options={[
                  { value: "", label: "All types" },
                  ...FEEDBACK_TYPES.map((t) => ({ value: t, label: t })),
                ]}
              />
              <SelectMenu
                ariaLabel="Filter by priority"
                className="w-full sm:w-40"
                value={priority}
                onChange={(v) => { setPage(1); setPriority(v); }}
                options={[
                  { value: "", label: "All priorities" },
                  ...Object.entries(PRIORITY_META).map(([k, val]) => ({ value: k, label: val.label })),
                ]}
              />
              <SelectMenu
                ariaLabel="Filter by rating"
                className="w-full sm:w-40"
                value={rating}
                onChange={(v) => { setPage(1); setRating(v); }}
                options={[
                  { value: "", label: "Any rating" },
                  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}★` })),
                ]}
              />
              <SelectMenu
                ariaLabel="Filter by assignee"
                className="w-full sm:w-40"
                value={assigned}
                onChange={(v) => { setPage(1); setAssigned(v); }}
                options={[
                  { value: "", label: "Any assignee" },
                  ...admins.map((a) => ({ value: a.id, label: a.name || a.email })),
                ]}
              />
              <SelectMenu
                ariaLabel="Sort by"
                className="w-full sm:w-40"
                value={sort}
                onChange={(v) => { setPage(1); setSort(v); }}
                options={[
                  { value: "created_at", label: "Newest created" },
                  { value: "updated_at", label: "Recently updated" },
                  { value: "priority", label: "Priority" },
                  { value: "rating", label: "Rating" },
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
              <table className="w-full text-left text-[13px] min-w-[900px]">
                <thead className="bg-surface-muted text-muted text-[11px] uppercase">
                  <tr>
                    {["ID", "User", "Type", "Rating", "Feedback", "Status", "Priority", "Assigned", "Created", ""].map((h) => (
                      <th key={h} className="py-3 px-4 font-semibold tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-muted">
                  {loading ? (
                    [1, 2, 3, 4, 5].map((i) => <tr key={i}><td colSpan={10} className="px-4 py-3"><Sk className="h-8" /></td></tr>)
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <span className="material-symbols-outlined text-line block mb-2" style={{ fontSize: 40 }}>reviews</span>
                        <p className="text-muted text-[14px]">No feedback matches your filters</p>
                      </td>
                    </tr>
                  ) : rows.map((r) => {
                    const assignee = admins.find((a) => a.id === r.assigned_admin_id);
                    return (
                      <tr key={r.id} className="hover:bg-surface-muted transition-colors cursor-pointer" onClick={() => setSelectedId(r.id)}>
                        <td className="py-3 px-4 font-bold text-brand-900 whitespace-nowrap">{r.ticket}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-ink truncate max-w-[150px]">{r.user_name || "—"}</div>
                          <div className="text-[11px] text-muted truncate max-w-[150px]">{r.user_email}</div>
                        </td>
                        <td className="py-3 px-4 text-ink whitespace-nowrap">{r.type}</td>
                        <td className="py-3 px-4"><RatingInline rating={r.rating} /></td>
                        <td className="py-3 px-4 max-w-[240px]">
                          <span className="text-ink line-clamp-2">{r.message}</span>
                          {typeof r.reply_count === "number" && r.reply_count > 0 && (
                            <span className="text-[10px] text-muted font-semibold">{r.reply_count} {r.reply_count === 1 ? "reply" : "replies"}</span>
                          )}
                        </td>
                        <td className="py-3 px-4"><StatusPill status={r.status} /></td>
                        <td className="py-3 px-4"><PriorityPill priority={r.priority} /></td>
                        <td className="py-3 px-4 text-muted whitespace-nowrap">{assignee ? (assignee.name || assignee.email) : <span className="text-muted">Unassigned</span>}</td>
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
        </>
      ) : (
        <FeedbackAnalyticsPanel />
      )}

      {selectedId && (
        <FeedbackDetailModal
          feedbackId={selectedId}
          admins={admins}
          onClose={() => setSelectedId(null)}
          onChanged={onChanged}
        />
      )}

      {showSettings && <PromptSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function StatCard({ label, value, icon, tone, suffix }: { label: string; value?: number | string; icon: string; tone: string; suffix?: string }) {
  return (
    <div className="bg-white rounded-xl border border-line p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{label}</span>
        <span className={`material-symbols-outlined ${tone}`} style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <div className={`mt-1 text-[24px] font-bold tabular-nums ${tone}`}>
        {value === undefined ? "—" : value}{value !== undefined && suffix ? <span className="text-[13px] font-semibold text-muted ml-0.5">{suffix}</span> : null}
      </div>
    </div>
  );
}

// ── Detail modal (read-only) ─────────────────────────────────────────────────
//
// A simple centered popup for viewing a single feedback. It is intentionally
// read-only: it never mutates status / priority / assignee, so opening a
// feedback can never change the summary counts. Triage stays a deliberate,
// separate action — delete is the only mutation offered here.

function FeedbackDetailModal({
  feedbackId, admins, onClose, onChanged,
}: {
  feedbackId: string;
  admins: AssignableAdmin[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const detail = useLoad<AdminFeedbackDetail>(() => adminGetFeedback(feedbackId), [feedbackId]);
  const feedback = detail.data?.feedback ?? null;
  const messages = detail.data?.messages ?? [];
  const notes = detail.data?.notes ?? [];
  const loading = detail.loading;

  const [actionErr, setActionErr] = useState("");
  const error = detail.error || actionErr;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", h); };
  }, [onClose]);

  const doDelete = async () => {
    if (!feedback) return;
    setDeleting(true);
    try {
      await adminDeleteFeedback(feedback.id);
      onChanged();
      onClose();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Failed to delete.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const provider = useMemo(() => {
    const p = (feedback?.auth_provider || "").toLowerCase();
    if (p.includes("google")) return "Google";
    if (p.includes("micro") || p.includes("azure")) return "Microsoft";
    return "Email / Password";
  }, [feedback]);

  const assignee = feedback ? admins.find((a) => a.id === feedback.assigned_admin_id) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-2xl max-h-[92vh] sm:max-h-[86vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line bg-brand-900 text-white shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold">{feedback?.ticket ?? "…"}</span>
              {feedback && <StatusPill status={feedback.status} />}
              {feedback && <PriorityPill priority={feedback.priority} />}
              {feedback && <span className="text-[11px] font-semibold text-white/80 bg-white/10 px-2 py-0.5 rounded-full">{feedback.type}</span>}
            </div>
            {!loading && feedback && (
              <div className="mt-1 flex items-center gap-2">
                <RatingInline rating={feedback.rating} />
                <span className="text-[11px] text-white/60">{dateShort(feedback.created_at)}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors shrink-0" aria-label="Close">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        {error && <div className="px-5 py-2 bg-danger-soft text-danger text-[12px] shrink-0">{error}</div>}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="space-y-3"><Sk className="h-6" /><Sk className="h-24" /></div>
          ) : feedback ? (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-line bg-canvas p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">User</p>
                  <div className="text-[13px] font-semibold text-ink">{feedback.user_name || "—"}</div>
                  <div className="text-[12px] text-muted break-all">{feedback.user_email}</div>
                  <div className="text-[11px] text-muted inline-flex items-center gap-1 mt-1">
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>badge</span>{provider}
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-canvas p-3 text-[12px] text-muted space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Details</p>
                  <div>Type: <span className="text-ink font-medium">{feedback.type}</span></div>
                  <div>Assigned: <span className="text-ink font-medium">{assignee ? (assignee.name || assignee.email) : "Unassigned"}</span></div>
                  <div>Created: <span className="text-ink font-medium">{dateShort(feedback.created_at)}</span></div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">Feedback</p>
                <div className="px-4 py-3 rounded-xl bg-surface-muted border border-line text-[13px] leading-relaxed whitespace-pre-wrap break-words text-ink">
                  {feedback.message}
                </div>
              </div>

              {messages.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">Replies</p>
                  <div className="space-y-2">
                    {messages.map((m) => {
                      const isUser = m.sender_type === "user";
                      return (
                        <div key={m.id} className={`px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap break-words border ${isUser ? "bg-white border-line text-ink" : "bg-brand-100 border-brand-100 text-ink"}`}>
                          <span className="block text-[10px] font-bold mb-0.5 text-muted">{isUser ? "User" : "Team"}</span>
                          {m.message}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {notes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">Internal notes</p>
                  <div className="space-y-2">
                    {notes.map((n) => (
                      <div key={n.id} className="px-3.5 py-2.5 rounded-lg bg-warning-soft text-[#7c4a03] dark:text-amber-300 border border-wheat-300 dark:border-amber-900/40 text-[13px] whitespace-pre-wrap break-words">
                        <span className="block text-[10px] font-bold uppercase tracking-wide mb-1">🔒 {n.admin_name || "Admin"}</span>
                        {n.note}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(feedback.conversation_id || feedback.message_id || feedback.provider || feedback.model) && (
                <div className="rounded-lg border border-line bg-white p-3 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Chatbot context</p>
                  {feedback.provider && <CtxRow label="Provider" value={feedback.provider} />}
                  {feedback.model && <CtxRow label="Model" value={feedback.model} />}
                  {feedback.conversation_id && <CtxRow label="Conversation" value={feedback.conversation_id} mono />}
                  {feedback.message_id && <CtxRow label="Message" value={feedback.message_id} mono />}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted text-[13px] py-6 text-center">Feedback not found.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-line bg-white shrink-0">
          <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] text-danger hover:bg-danger-soft transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
            Delete
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors">Close</button>
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Delete feedback?"
        message="This permanently removes the feedback and its replies/notes. This cannot be undone."
        confirmText="Delete"
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
        centered
      />
    </div>
  );
}

function CtxRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted shrink-0">{label}</span>
      <span className={`text-ink truncate max-w-[150px] ${mono ? "font-mono" : ""}`} title={value}>{value}</span>
    </div>
  );
}

// ── Prompt settings modal ──────────────────────────────────────────────────────

function PromptSettingsModal({ onClose }: { onClose: () => void }) {
  const load = useLoad(() => adminGetFeedbackSettings(), []);

  return (
    <ModalShell title="Automatic Feedback Prompt" onClose={onClose} centered>
      {load.loading ? (
        <div className="space-y-3 py-2"><Sk className="h-10" /><Sk className="h-10" /><Sk className="h-10" /></div>
      ) : load.error ? (
        <div className="px-3 py-2 rounded-lg bg-danger-soft text-danger text-[12px]">{load.error}</div>
      ) : load.data ? (
        // Remount the form from the freshly-loaded settings via key so its
        // local state initialises from props (no setState inside an effect).
        <SettingsForm key="loaded" initial={load.data} onClose={onClose} />
      ) : null}
    </ModalShell>
  );
}

function SettingsForm({ initial, onClose }: { initial: FeedbackSettings; onClose: () => void }) {
  const [form, setForm] = useState<FeedbackSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await adminUpdateFeedbackSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save settings.");
    } finally {
      setBusy(false);
    }
  };

  const setNum = (k: "first_prompt_login" | "prompt_interval" | "cooldown_days", raw: string) =>
    setForm((f) => ({ ...f, [k]: Math.max(0, parseInt(raw, 10) || 0) }));

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted leading-relaxed">
        Control when the in-app feedback popup appears. Login&nbsp;#1 never shows it; the first prompt happens on the
        login number below, then repeats every <em>interval</em> logins once the cooldown has passed.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] font-semibold text-ink">
          First prompt at login #
          <input type="number" min={2} className={`${inputCls} mt-1`} value={form.first_prompt_login} onChange={(e) => setNum("first_prompt_login", e.target.value)} />
        </label>
        <label className="text-[12px] font-semibold text-ink">
          Repeat every (logins)
          <input type="number" min={1} className={`${inputCls} mt-1`} value={form.prompt_interval} onChange={(e) => setNum("prompt_interval", e.target.value)} />
        </label>
        <label className="text-[12px] font-semibold text-ink">
          Cooldown (days)
          <input type="number" min={0} className={`${inputCls} mt-1`} value={form.cooldown_days} onChange={(e) => setNum("cooldown_days", e.target.value)} />
        </label>
      </div>

      <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
        <span className="text-[13px] text-ink font-medium">Require a star rating</span>
        <input type="checkbox" checked={form.require_rating} onChange={(e) => setForm({ ...form, require_rating: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
        <span className="text-[13px] text-ink font-medium">Automatic prompts enabled</span>
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
      </label>

      {err && <div className="px-3 py-2 rounded-lg bg-danger-soft text-danger text-[12px]">{err}</div>}
      {saved && <div className="px-3 py-2 rounded-lg bg-brand-100 text-brand-700 text-[12px]">Settings saved.</div>}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors">Close</button>
        <PrimaryBtn onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save settings"}</PrimaryBtn>
      </div>
    </div>
  );
}
