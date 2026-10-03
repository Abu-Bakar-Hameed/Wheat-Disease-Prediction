"use client";

import { useState } from "react";
import { Trash2, ChevronDown, ChevronUp, Info } from "lucide-react";
import Image from "next/image";
import type { HistoryItem } from "@/types";
import { cn, confidenceColour, fmtDate, humaniseClassName, severityColour, severityEmoji } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

interface HistoryTableProps {
  items: HistoryItem[];
  loading?: boolean;
  onDelete?: (id: string) => void;
  onView?: (item: HistoryItem) => void;
}

export function HistoryTable({ items, loading, onDelete, onView }: HistoryTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-zinc-700">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800">
          <Info className="h-6 w-6 text-gray-400 dark:text-zinc-500" />
        </div>
        <p className="font-medium text-gray-600 dark:text-zinc-300">No predictions found.</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-zinc-500">
          Try adjusting your filters, or upload a wheat leaf image to get started.
        </p>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    if (!onDelete) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-700 md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-700">
            <thead className="bg-gray-50 dark:bg-zinc-800">
              <tr>
                {["Filename", "Disease", "Confidence", "Severity", "Date", "Actions"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
              {items.map((item) => {
                const colours = severityColour(item.severity);
                const isDeleting = deletingId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50",
                      isDeleting && "opacity-50"
                    )}
                  >
                    {/* Filename */}
                    <td className="max-w-[10rem] px-4 py-3">
                      <span className="block truncate text-sm text-gray-600 dark:text-zinc-300" title={item.filename}>
                        {item.filename}
                      </span>
                    </td>

                    {/* Disease */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-gray-800 dark:text-zinc-100">
                          {humaniseClassName(item.predicted_class)}
                        </span>
                        {item.low_confidence && (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400">
                            ⚠ Low confidence
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Confidence */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                          <div
                            className={cn("h-full rounded-full", confidenceColour(item.confidence_pct))}
                            style={{ width: `${Math.min(item.confidence_pct, 100)}%` }}
                            role="progressbar"
                            aria-valuenow={item.confidence_pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          />
                        </div>
                        <span className="text-sm tabular-nums text-gray-600 dark:text-zinc-300">
                          {item.confidence_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>

                    {/* Severity */}
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", colours.badge)}>
                        {severityEmoji(item.severity)}{" "}
                        {item.severity
                          ? item.severity.charAt(0).toUpperCase() + item.severity.slice(1)
                          : "Unknown"}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-zinc-400">
                      {fmtDate(item.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {onView && (
                          <button
                            onClick={() => onView(item)}
                            aria-label={`View details for ${item.predicted_class}`}
                            className="rounded p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={isDeleting}
                            aria-label={`Delete prediction ${item.id}`}
                            className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                          >
                            {isDeleting ? (
                              <Spinner className="h-4 w-4" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {items.map((item) => {
          const colours = severityColour(item.severity);
          const isDeleting = deletingId === item.id;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-xl border border-gray-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900",
                isDeleting && "opacity-50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-zinc-100">
                    {humaniseClassName(item.predicted_class)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-zinc-400">
                    {item.filename}
                  </p>
                </div>
                <span className={cn("flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", colours.badge)}>
                  {severityEmoji(item.severity)} {item.severity
                    ? item.severity.charAt(0).toUpperCase() + item.severity.slice(1)
                    : "Unknown"}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                    <div
                      className={cn("h-full rounded-full", confidenceColour(item.confidence_pct))}
                      style={{ width: `${Math.min(item.confidence_pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm tabular-nums text-gray-600 dark:text-zinc-300">
                    {item.confidence_pct.toFixed(1)}%
                  </span>
                  {item.low_confidence && (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400">⚠</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 dark:text-zinc-500">
                  {fmtDate(item.created_at)}
                </span>
              </div>

              <div className="mt-3 flex justify-end gap-2">
                {onView && (
                  <button
                    onClick={() => onView(item)}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Info className="h-3.5 w-3.5" /> Details
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={isDeleting}
                    className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
