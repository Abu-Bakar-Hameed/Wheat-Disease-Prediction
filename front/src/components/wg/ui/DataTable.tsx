"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Feedback";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  /** Render the cell; falls back to row[key]. */
  render?: (row: T, index: number) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  /** Hide this column below the `md` breakpoint (fold into card view). */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: (row: T, index: number) => string | number;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T, index: number) => void;
  className?: string;
  /** Sticky header row. */
  stickyHeader?: boolean;
  /** Compact row density. */
  dense?: boolean;
}

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  rows,
  keyField,
  loading = false,
  empty,
  onRowClick,
  className,
  stickyHeader = true,
  dense = false,
}: DataTableProps<T>) {
  const cellPad = dense ? "px-3 py-2" : "px-4 py-3";
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-line bg-surface", className)}>
      <table className="w-full border-collapse text-sm">
        <thead className={cn("bg-surface-muted text-muted", stickyHeader && "sticky top-0 z-10")}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "whitespace-nowrap border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wide",
                  ALIGN[col.align ?? "left"],
                  col.hideOnMobile && "hidden md:table-cell",
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: dense ? 5 : 6 }).map((_, r) => (
              <tr key={r} className="border-b border-line/70">
                {columns.map((col) => (
                  <td key={col.key} className={cn(cellPad, col.hideOnMobile && "hidden md:table-cell")}>
                    <Skeleton className="h-4 w-full max-w-[10rem]" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-muted">
                {empty ?? "No records to display."}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={keyField(row, index)}
                onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                className={cn(
                  "border-b border-line/70 transition-colors duration-150 last:border-0 hover:bg-brand-50/40",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      cellPad,
                      ALIGN[col.align ?? "left"],
                      "text-ink",
                      col.hideOnMobile && "hidden md:table-cell",
                      col.cellClassName
                    )}
                  >
                    {col.render ? col.render(row, index) : ((row as Record<string, ReactNode>)[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
