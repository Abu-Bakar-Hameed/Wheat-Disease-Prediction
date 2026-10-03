"use client";

import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/* ── Tabs ───────────────────────────────────────────────────────────── */

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  fill?: boolean;
}

export function Tabs({ tabs, value, onChange, className, fill }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1", className)}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md px-3.5 h-9 text-sm font-medium transition-all duration-200 ease-out",
              fill && "flex-1",
              active
                ? "bg-surface text-brand-800 shadow-xs"
                : "text-muted hover:text-ink"
            )}
          >
            {tab.icon && <Icon name={tab.icon} size={18} />}
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={cn(
                  "ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs",
                  active ? "bg-brand-100 text-brand-700" : "bg-line text-muted"
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Breadcrumb ─────────────────────────────────────────────────────── */

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center text-sm text-muted", className)}>
      <ol className="flex items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {item.href && !last ? (
                <a href={item.href} className="transition-colors hover:text-brand-700">
                  {item.label}
                </a>
              ) : (
                <span className={cn(last && "font-medium text-ink")}>{item.label}</span>
              )}
              {!last && <Icon name="chevron_right" size={16} className="text-muted/60" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Pagination ─────────────────────────────────────────────────────── */

export interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
  /** Compact window of page numbers shown around current. */
  siblingCount?: number;
}

function buildPages(page: number, pageCount: number, siblings: number): (number | "…")[] {
  const pages: (number | "…")[] = [];
  const total = pageCount;
  const start = Math.max(2, page - siblings);
  const end = Math.min(total - 1, page + siblings);
  pages.push(1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  if (total > 1) pages.push(total);
  return pages;
}

export function Pagination({ page, pageCount, onChange, className, siblingCount = 1 }: PaginationProps) {
  if (pageCount <= 1) return null;
  const pages = buildPages(page, pageCount, siblingCount);
  const btn =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center gap-1", className)}>
      <button type="button" className={cn(btn, "text-muted hover:bg-surface-muted")} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <Icon name="chevron_left" size={18} />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(btn, p === page ? "bg-brand-700 text-white" : "text-ink hover:bg-surface-muted")}
          >
            {p}
          </button>
        )
      )}
      <button type="button" className={cn(btn, "text-muted hover:bg-surface-muted")} onClick={() => onChange(page + 1)} disabled={page >= pageCount} aria-label="Next page">
        <Icon name="chevron_right" size={18} />
      </button>
    </nav>
  );
}
