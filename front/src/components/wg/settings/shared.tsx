"use client";

/**
 * Shared primitives used across every settings section component.
 * Keep this file free of any API imports — it's pure UI.
 */

import React from "react";

/* ── Toggle pill ────────────────────────────────────────────────────────── */
export function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
        checked ? "bg-brand-600" : "bg-line"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ── Toggle row ─────────────────────────────────────────────────────────── */
export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  badge,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-line last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <label
            htmlFor={id}
            className="text-[14px] font-medium text-ink cursor-pointer"
          >
            {label}
          </label>
          {badge && (
            <span className="hidden sm:inline-flex items-center rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-bold text-brand-700 uppercase tracking-wide">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} />
    </div>
  );
}

/* ── Inline banner ──────────────────────────────────────────────────────── */
export function Banner({
  type,
  message,
  onDismiss,
}: {
  type: "success" | "error";
  message: string;
  onDismiss?: () => void;
}) {
  const colors =
    type === "success"
      ? "bg-brand-50 border-brand-200 text-brand-800"
      : "bg-danger-soft border-danger/30 text-danger";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13px] font-medium ${colors}`}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ── Skeleton rows ──────────────────────────────────────────────────────── */
export function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="space-y-3 pt-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-muted" />
      ))}
    </div>
  );
}

/* ── Auto-save footer ─────────────────────────────────────────────────────
   Replaces the old Save button: every settings section now persists changes
   automatically a moment after the last edit, so this is a passive status
   line ("Saving…" while a PATCH is in flight, "Changes save automatically"
   once the queue is empty) rather than an action the user must remember. */
export function AutoSaveRow({ saving }: { saving: boolean }) {
  return (
    <div className="flex justify-end pt-4" aria-live="polite">
      <span className="inline-flex items-center gap-2 text-[12px] font-medium text-muted">
        {saving ? (
          <>
            <span className="h-3 w-3 rounded-full border-2 border-line border-t-brand-600 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-brand-600" style={{ fontSize: 15 }}>
              cloud_done
            </span>
            Changes save automatically
          </>
        )}
      </span>
    </div>
  );
}

/* ── Generic error message extractor ───────────────────────────────────── */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

/* ── Section heading ───────────────────────────────────────────────────── */
export function SectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      <p className="text-[12px] text-muted mt-0.5 leading-relaxed">{description}</p>
    </div>
  );
}

/* ── Labeled dropdown ──────────────────────────────────────────────────── */
export function SelectRow<T extends string>({
  id,
  label,
  description,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-line last:border-0">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[14px] font-medium text-ink">
          {label}
        </label>
        {description && (
          <p className="text-[12px] text-muted mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900/60 transition max-w-[55%]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── Honest-disabled control ──────────────────────────────────────────── */
/**
 * Renders a control that exists in the product spec but has NO backing service
 * today (2FA, active sessions, bulk deletes…). It is visibly disabled and
 * badged “Coming soon” so we never fake a save or imply the feature works.
 */
export function DisabledRow({
  label,
  description,
  kind = "toggle",
}: {
  label: string;
  description: string;
  kind?: "toggle" | "button";
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-line last:border-0 opacity-70">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-medium text-muted">{label}</span>
          <span className="inline-flex items-center rounded-full bg-warning-soft border border-warning/30 px-2 py-0.5 text-[10px] font-bold text-warning uppercase tracking-wide">
            Coming soon
          </span>
        </div>
        <p className="text-[12px] text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
      {kind === "button" ? (
        <button
          type="button"
          disabled
          className="shrink-0 cursor-not-allowed rounded-xl border border-line bg-surface-muted px-4 py-2 text-[13px] font-semibold text-muted"
        >
          Manage
        </button>
      ) : (
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-line" aria-hidden="true">
          <span className="inline-block h-5 w-5 translate-x-0 rounded-full bg-white shadow" />
        </span>
      )}
    </div>
  );
}
