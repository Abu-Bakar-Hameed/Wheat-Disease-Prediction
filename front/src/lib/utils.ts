/**
 * WheatGuard AI – Utility helpers
 */

import { clsx, type ClassValue } from "clsx";
import type { ConfidenceLevel, SeverityLevel } from "@/types";

/** Merge Tailwind class names conditionally. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Format a confidence value (0–1) to a percentage string. */
export function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Format a Date/ISO string into a locale-friendly string. */
export function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a date to short date only (no time). */
export function fmtDateShort(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Return Tailwind colour classes for a severity level. */
export function severityColour(severity: SeverityLevel | string): {
  bg: string;
  text: string;
  border: string;
  badge: string;
  dot: string;
} {
  switch (severity?.toLowerCase()) {
    case "none":
      return {
        bg: "bg-green-50 dark:bg-green-950/20",
        text: "text-green-700 dark:text-green-400",
        border: "border-green-200 dark:border-green-800",
        badge: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
        dot: "bg-green-500",
      };
    case "moderate":
      return {
        bg: "bg-yellow-50 dark:bg-yellow-950/20",
        text: "text-yellow-700 dark:text-yellow-400",
        border: "border-yellow-200 dark:border-yellow-800",
        badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
        dot: "bg-yellow-500",
      };
    case "high":
      return {
        bg: "bg-orange-50 dark:bg-orange-950/20",
        text: "text-orange-700 dark:text-orange-400",
        border: "border-orange-200 dark:border-orange-800",
        badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
        dot: "bg-orange-500",
      };
    case "critical":
      return {
        bg: "bg-red-50 dark:bg-red-950/20",
        text: "text-red-700 dark:text-red-400",
        border: "border-red-200 dark:border-red-800",
        badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
        dot: "bg-red-500",
      };
    default:
      return {
        bg: "bg-gray-50 dark:bg-zinc-800/50",
        text: "text-gray-600 dark:text-zinc-400",
        border: "border-gray-200 dark:border-zinc-700",
        badge: "bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300",
        dot: "bg-gray-400",
      };
  }
}

/** Severity emoji indicator. */
export function severityEmoji(severity: SeverityLevel | string): string {
  switch (severity?.toLowerCase()) {
    case "none":     return "🟢";
    case "moderate": return "🟡";
    case "high":     return "🟠";
    case "critical": return "🔴";
    default:         return "⚪";
  }
}

/** Confidence percentage → Tailwind colour for bars. */
export function confidenceColour(pct: number): string {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 60) return "bg-yellow-500";
  if (pct >= 40) return "bg-orange-500";
  return "bg-red-500";
}

/** Confidence level label → colour classes. */
export function confidenceLevelColour(level: ConfidenceLevel | string): string {
  switch (level) {
    case "High":      return "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40";
    case "Moderate":  return "text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/40";
    case "Low":       return "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40";
    case "Very Low":  return "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40";
    default:          return "text-gray-700 bg-gray-100 dark:text-zinc-300 dark:bg-zinc-800";
  }
}

/** Capitalise and un-underscore a class name string. */
export function humaniseClassName(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Validate file type before upload. */
export function isAllowedImage(file: File): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

/** Validate file size (bytes). */
export function isWithinSizeLimit(file: File, maxMb = 10): boolean {
  return file.size <= maxMb * 1024 * 1024;
}

/** Format bytes to human-readable string. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Truncate text to a max length with ellipsis. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Simple chart colour palette for disease/severity charts. */
export const CHART_COLORS = [
  "#16a34a", // green-600
  "#ca8a04", // yellow-600
  "#ea580c", // orange-600
  "#dc2626", // red-600
  "#2563eb", // blue-600
  "#9333ea", // purple-600
  "#0891b2", // cyan-600
  "#db2777", // pink-600
];

/** Severity → chart colour. */
export function severityChartColour(severity: string): string {
  switch (severity?.toLowerCase()) {
    case "none":     return "#16a34a";
    case "moderate": return "#ca8a04";
    case "high":     return "#ea580c";
    case "critical": return "#dc2626";
    default:         return "#6b7280";
  }
}
