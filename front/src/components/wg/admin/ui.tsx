"use client";

import { useEffect, useState, type ReactNode } from "react";

/* ── Skeleton ─────────────────────────────────────────────────────────── */
export function Sk({ className = "h-8 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-muted ${className}`} />;
}

/* ── Route-level fallback for lazily-loaded admin pages ───────────────── */
// Rendered by next/dynamic while a heavy admin page chunk streams in, so the
// sidebar / top bar paint and hydrate immediately instead of blocking on the
// page's own code (recharts, big tables, …).
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Sk key={i} className="h-28 rounded-xl" />)}
      </div>
      <Sk className="h-64" />
      <Sk className="h-64" />
    </div>
  );
}

/* ── Leaf thumbnail ───────────────────────────────────────────────────── */
export function LeafThumb({ src, alt, className = "w-10 h-10" }: { src?: string | null; alt: string; className?: string }) {
  return (
    <div className={`${className} rounded-lg overflow-hidden bg-brand-100 shrink-0`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-brand-700">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>eco</span>
        </div>
      )}
    </div>
  );
}

/* ── Status badge (active/inactive) ──────────────────────────────────── */
export function StatusBadge({ value }: { value: string }) {
  const on = value.toLowerCase() === "active";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
        on ? "bg-brand-100 text-brand-700" : "bg-surface-muted text-muted"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-brand-700" : "bg-muted"}`} />
      {on ? "Active" : "Inactive"}
    </span>
  );
}

/* ── Result badge (healthy/disease) ──────────────────────────────────── */
export function ResultBadge({ value }: { value: string }) {
  const healthy = value.toLowerCase() === "healthy";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
        healthy ? "bg-brand-100 text-brand-700" : "bg-danger-soft text-danger"
      }`}
    >
      <span className={`material-symbols-outlined ${healthy ? "text-brand-700" : "text-danger"}`} style={{ fontSize: 12 }}>
        {healthy ? "check_circle" : "warning"}
      </span>
      {healthy ? "Healthy" : value || "Detected"}
    </span>
  );
}

/* ── Modal shell ──────────────────────────────────────────────────────── */
export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] p-0 sm:items-center sm:p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl max-h-[92vh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col">
        {/* Mobile drag handle (hidden on sm+ where the sheet is centered). */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between px-4 py-4 sm:px-6 border-b border-line shrink-0">
          <h3 className="text-[16px] font-bold text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ── Form field ───────────────────────────────────────────────────────── */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[13px] font-medium text-ink mb-4">
      <span className="block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/* ── Input class ──────────────────────────────────────────────────────── */
export const inputCls =
  "w-full px-3 py-2.5 rounded-lg border border-line text-[14px] outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10 bg-white transition-all";

/* ── Toggle ───────────────────────────────────────────────────────────── */
export function Toggle({
  checked,
  onChange,
  loading = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled || loading}
      onClick={(e) => {
        e.stopPropagation();
        if (!loading && !disabled) {
          onChange(!checked);
        }
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none ${
        disabled ? "opacity-50 cursor-not-allowed" : "active:scale-90 hover:opacity-95"
      } ${
        checked ? "bg-brand-600 shadow-[0_0_8px_rgba(22,163,74,0.3)]" : "bg-line"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none flex items-center justify-center h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      >
        {loading ? (
          <span
            className={`w-2.5 h-2.5 border-2 rounded-full animate-spin ${
              checked ? "border-brand-600 border-t-transparent" : "border-muted border-t-transparent"
            }`}
          />
        ) : null}
      </span>
    </button>
  );
}

/* ── Search bar ───────────────────────────────────────────────────────── */
export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 max-w-sm">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted" style={{ fontSize: 16 }}>
        search
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pl-9 text-[13px]`}
      />
    </div>
  );
}

/* ── Primary button ───────────────────────────────────────────────────── */
export function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold hover:bg-brand-800 disabled:opacity-50 transition-colors shadow-sm"
    >
      {children}
    </button>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;

  return (
    <ModalShell title={title} onClose={busy ? () => {} : onCancel}>
      <div className="space-y-4">
        <p className="text-[14px] leading-relaxed text-ink">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex items-center justify-center gap-2 min-w-[96px] px-4 py-2 rounded-lg bg-danger text-white text-[13px] font-semibold hover:bg-danger disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
          >
            {busy && (
              <span
                aria-hidden
                className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
              />
            )}
            {busy ? "Deleting…" : confirmText}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ── Icon button ──────────────────────────────────────────────────────── */
export function IconBtn({
  icon,
  title,
  onClick,
  danger,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg transition-colors ${
        danger ? "text-danger hover:bg-danger-soft" : "text-brand-700 hover:bg-brand-100"
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{icon}</span>
    </button>
  );
}

/* ── Pagination ───────────────────────────────────────────────────────── */
export function usePager(total: number, limit: number, page: number, setPage: (n: number) => void) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return {
    pages,
    pager: (
      <div className="flex items-center justify-between px-1 pt-4 text-[13px]">
        <span className="text-[12px] text-muted">
          {total} total · page {page} of {pages}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line disabled:opacity-40 hover:bg-surface-muted transition-colors text-[12px]"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_left</span>
            Prev
          </button>
          <button
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line disabled:opacity-40 hover:bg-surface-muted transition-colors text-[12px]"
          >
            Next
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
          </button>
        </div>
      </div>
    ),
  };
}

/* ── Data loader hook ─────────────────────────────────────────────────── */
// Module-level stale-while-revalidate cache. When a caller supplies a
// `cacheKey`, the last successful result is remembered so revisiting a page
// (e.g. clicking back to the dashboard) paints the cached data INSTANTLY and
// then refreshes it in the background — no skeleton flash on every nav.
const _loadCache = new Map<string, unknown>();

export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = [], cacheKey?: string) {
  // Seed synchronously from cache so the first render already has data.
  const hasCache = cacheKey !== undefined && _loadCache.has(cacheKey);
  const [data, setData] = useState<T | null>(
    hasCache ? (_loadCache.get(cacheKey as string) as T) : null
  );
  const [loading, setLoading] = useState(!hasCache);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    // Only show the loading state when there is nothing cached to display;
    // otherwise revalidate quietly in the background.
    if (!(cacheKey !== undefined && _loadCache.has(cacheKey))) setLoading(true);
    setError("");
    loader()
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (cacheKey !== undefined) _loadCache.set(cacheKey, d);
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, loading, error, reload: () => setTick((t) => t + 1), setData };
}

/** Drop cached entries so the next mount refetches (call after a mutation). */
export function invalidateLoad(prefix?: string) {
  if (!prefix) { _loadCache.clear(); return; }
  for (const k of Array.from(_loadCache.keys())) {
    if (k.startsWith(prefix)) _loadCache.delete(k);
  }
}
