"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { Button } from "./Button";

/* ── Alert ──────────────────────────────────────────────────────────── */

export type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT: Record<AlertTone, { wrap: string; icon: string; iconName: string }> = {
  info: { wrap: "bg-info-soft text-blue-900 border-blue-200", icon: "text-info", iconName: "info" },
  success: { wrap: "bg-success-soft text-green-900 border-green-200", icon: "text-success", iconName: "check_circle" },
  warning: { wrap: "bg-warning-soft text-amber-900 border-amber-200", icon: "text-warning", iconName: "warning" },
  danger: { wrap: "bg-danger-soft text-red-900 border-red-200", icon: "text-danger", iconName: "error" },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Alert({ tone = "info", title, children, icon, action, onDismiss, className }: AlertProps) {
  const cfg = ALERT[tone];
  return (
    <div
      role="alert"
      className={cn("flex items-start gap-3 rounded-lg border p-4 text-sm", cfg.wrap, className)}
    >
      <Icon name={icon ?? cfg.iconName} size={20} className={cn("mt-0.5 shrink-0", cfg.icon)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}

/* ── Skeleton ───────────────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("wg-shimmer rounded-md", className)} aria-hidden />;
}

/* ── Empty / Loading / Error states ─────────────────────────────────── */

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = "inbox", title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon name={icon} size={28} />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12 text-muted", className)} role="status" aria-live="polite">
      <span className="material-symbols-outlined animate-spin text-[28px] text-brand-600" aria-hidden>
        progress_activity
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = "Something went wrong", message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-red-200 bg-danger-soft px-6 py-12 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-danger">
        <Icon name="error" size={28} />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {onRetry && (
        <div className="mt-5">
          <Button variant="outline" leftIcon="refresh" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
