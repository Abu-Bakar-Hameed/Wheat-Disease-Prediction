"use client";

/**
 * Shared UI primitives for the admin User Retention module.
 *
 * Used by:
 *  • UserRetentionPage.tsx          — main /admin/user-retention page
 *  • UserRetentionDetailPage.tsx    — /admin/user-retention/users/[userId]
 *
 * Keeping them here guarantees identical status badges, retention chips and
 * severity colors across both pages (spec §26 — one color per status).
 */

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function formatISODate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelativeDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round(
    (startOf(new Date()).getTime() - startOf(d).getTime()) / 86_400_000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ── Generic states ────────────────────────────────────────────────────────────

export function EmptyState({ message, icon = "person_off" }: { message: string; icon?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-muted">
      <span className="material-symbols-outlined" style={{ fontSize: 40 }}>{icon}</span>
      <p className="max-w-xs text-center text-[13px]">{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-muted">
      <span className="material-symbols-outlined text-red-400" style={{ fontSize: 36 }}>error_outline</span>
      <p className="text-[13px] text-muted">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-lg bg-brand-700 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-900"
      >
        Try Again
      </button>
    </div>
  );
}

// ── Retention status badge (4 states — consolidated spec §4 / §16) ───────────

export const RETENTION_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  new:       { label: "New",       cls: "bg-info-soft text-info", dot: "bg-info" },
  active:    { label: "Active",    cls: "bg-brand-100 text-brand-700", dot: "bg-brand-700" },
  returning: { label: "Returning", cls: "bg-[#ccfbf1] text-[#0f766e]", dot: "bg-[#0f766e]" },
  inactive:  { label: "Inactive",  cls: "bg-surface-muted text-muted", dot: "bg-muted" },
};

/** New · Active · Returning · Inactive badge with a status dot. */
export function RetentionStatusBadge({ value }: { value: string }) {
  const meta = RETENTION_STATUS_META[value] ?? RETENTION_STATUS_META.inactive;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/**
 * D1/D7/D14/D30 chip:
 *  ✓ retained · ✕ not retained (window elapsed) · dashed "not yet reached".
 */
export function RetentionDot({ label, retained, observable }: { label: string; retained: boolean; observable: boolean }) {
  if (!observable) {
    return (
      <span
        title={`${label}: not yet reached`}
        className="inline-flex h-6 min-w-[36px] items-center justify-center rounded-md border border-dashed border-line px-1.5 text-[10px] font-semibold text-muted"
      >
        {label}
      </span>
    );
  }
  return (
    <span
      title={`${label}: ${retained ? "retained" : "not retained"}`}
      className={`inline-flex h-6 min-w-[36px] items-center justify-center gap-0.5 rounded-md px-1.5 text-[10px] font-bold ${
        retained ? "bg-brand-100 text-brand-700" : "bg-surface-muted text-muted"
      }`}
    >
      {retained ? "✓" : "✕"} {label}
    </span>
  );
}

// ── Severity colors (spec §26 — same tokens as the rest of the product) ──────

export function severityPill(severity: string): string {
  const s = (severity || "").toLowerCase();
  if (s.includes("high") || s.includes("critical") || s.includes("severe")) return "bg-danger-soft text-danger";
  if (s.includes("medium") || s.includes("moderate")) return "bg-warning-soft text-[#b45309] dark:text-amber-300";
  return "bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300";
}

// ── Activity-timeline icons ───────────────────────────────────────────────────

export const TIMELINE_ICONS: Record<string, string> = {
  signup: "person_add",
  prediction_created: "science",
  user_login: "login",
  user_logout: "logout",
  calendar_opened: "calendar_month",
  prediction_history_opened: "history",
  prediction_viewed: "visibility",
  prediction_completed_viewed: "visibility",
  notification_viewed: "notifications",
  notification_clicked: "notifications_active",
  assistant_used: "smart_toy",
  profile_viewed: "person",
  settings_viewed: "settings",
};
