"use client";

/**
 * settingsFormat — the single place user display settings (units, time zone,
 * date/time format, first day of week) are turned into rendered strings.
 *
 * Every helper is a pure function of `(value, settings)` so it can be used both
 * imperatively and through the `useSettingsFormat()` hook. Nothing here mutates
 * data or touches the ML/weather calculations — it is presentation-only and
 * applied at the view layer (spec §Phase 2).
 */

import { useMemo } from "react";
import type { UserSettings } from "./api";
import { useUserSettings } from "./useUserSettings";

/* ── Accepted setting vocabularies (kept narrow + matched to the backend) ─── */

export type Units = "metric" | "imperial";
export type TimeFormat = "24" | "12";
export type FirstDayOfWeek = "monday" | "sunday" | "saturday";
export type DateFormat =
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "YYYY-MM-DD"
  | "DD MMM YYYY"
  | "MMM DD, YYYY";

export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: "DD/MM/YYYY", label: "31/12/2025" },
  { value: "MM/DD/YYYY", label: "12/31/2025" },
  { value: "YYYY-MM-DD", label: "2025-12-31" },
  { value: "DD MMM YYYY", label: "31 Dec 2025" },
  { value: "MMM DD, YYYY", label: "Dec 31, 2025" },
];

export const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: "24", label: "24-hour (14:30)" },
  { value: "12", label: "12-hour (2:30 PM)" },
];

export const FIRST_DAY_OPTIONS: { value: FirstDayOfWeek; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
  { value: "saturday", label: "Saturday" },
];

/**
 * Top-level dashboard routes a user may set as their landing page. Only real,
 * existing routes appear here (no dynamic/detail pages) so the "Default start
 * page" control can never offer a link that 404s. Shared by the General section
 * and the dashboard landing effect so the two can't drift.
 */
export const DASHBOARD_LANDING_ROUTES: { path: string; label: string }[] = [
  { path: "/dashboard", label: "Overview" },
  { path: "/dashboard/detection", label: "Predict Disease" },
  { path: "/dashboard/history", label: "History" },
  { path: "/dashboard/weather", label: "Weather Risk" },
  { path: "/dashboard/calendar", label: "Calendar" },
  { path: "/dashboard/assistant", label: "AI Assistant" },
  { path: "/dashboard/library", label: "Reference Library" },
];

/* ── Time-zone detection ──────────────────────────────────────────────────── */

/**
 * A curated, widely-useful IANA zone list for the manual picker (kept short so
 * the dropdown stays usable), always prefixed at runtime by the detected device
 * zone. Values are real IANA identifiers passed straight to Intl's `timeZone`.
 */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "Africa/Lagos", label: "Africa / Lagos (WAT)" },
  { value: "Africa/Nairobi", label: "Africa / Nairobi (EAT)" },
  { value: "Asia/Karachi", label: "Asia / Karachi (PKT)" },
  { value: "Asia/Kolkata", label: "Asia / Kolkata (IST)" },
  { value: "Asia/Dubai", label: "Asia / Dubai (GST)" },
  { value: "Asia/Shanghai", label: "Asia / Shanghai (CST)" },
  { value: "Asia/Tokyo", label: "Asia / Tokyo (JST)" },
  { value: "Europe/London", label: "Europe / London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe / Paris (CET)" },
  { value: "Europe/Istanbul", label: "Europe / Istanbul (TRT)" },
  { value: "America/Sao_Paulo", label: "America / São Paulo (BRT)" },
  { value: "America/New_York", label: "America / New York (ET)" },
  { value: "America/Chicago", label: "America / Chicago (CT)" },
  { value: "America/Denver", label: "America / Denver (MT)" },
  { value: "America/Los_Angeles", label: "America / Los Angeles (PT)" },
  { value: "Australia/Sydney", label: "Australia / Sydney (AEST)" },
];


/** The browser's IANA zone, used when the user hasn't chosen one explicitly. */
export function detectTimezone(): string {
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return "";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function resolveTimeZone(settings: UserSettings): string | undefined {
  const tz = settings.timezone;
  if (tz && tz.trim()) return tz;
  // Unset → follow the device. Returning undefined lets Intl use the local
  // zone (equivalent to detectTimezone(), but without an explicit override).
  return undefined;
}

/* ── Core part extraction (honours the target zone, always 24h internally) ── */

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function zonedParts(date: Date, timeZone?: string): ZonedParts {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
    const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      year: Number(pick("year")),
      month: Number(pick("month")),
      day: Number(pick("day")),
      hour: Number(pick("hour")) % 24,
      minute: Number(pick("minute")),
    };
  } catch {
    // Bad/unsupported zone → fall back to the device's local fields.
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
}

function applyDateFormat(p: ZonedParts, fmt: string): string {
  switch (fmt) {
    case "MM/DD/YYYY":
      return `${pad(p.month)}/${pad(p.day)}/${p.year}`;
    case "YYYY-MM-DD":
      return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    case "DD MMM YYYY":
      return `${p.day} ${MONTHS_SHORT[p.month - 1] ?? ""} ${p.year}`;
    case "MMM DD, YYYY":
      return `${MONTHS_SHORT[p.month - 1] ?? ""} ${pad(p.day)}, ${p.year}`;
    case "DD/MM/YYYY":
    default:
      return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
  }
}

function applyTimeFormat(p: ZonedParts, tf: string): string {
  if (tf === "12") {
    const h = p.hour % 12 || 12;
    const suffix = p.hour < 12 ? "AM" : "PM";
    return `${h}:${pad(p.minute)} ${suffix}`;
  }
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/* ── Public date/time formatters ──────────────────────────────────────────── */

export function formatDate(
  value: Date | string | number | null | undefined,
  settings: UserSettings
): string {
  const d = toDate(value);
  if (!d) return "";
  return applyDateFormat(zonedParts(d, resolveTimeZone(settings)), settings.date_format || "DD/MM/YYYY");
}

export function formatTime(
  value: Date | string | number | null | undefined,
  settings: UserSettings
): string {
  const d = toDate(value);
  if (!d) return "";
  return applyTimeFormat(zonedParts(d, resolveTimeZone(settings)), settings.time_format || "24");
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  settings: UserSettings
): string {
  const d = toDate(value);
  if (!d) return "";
  const p = zonedParts(d, resolveTimeZone(settings));
  return `${applyDateFormat(p, settings.date_format || "DD/MM/YYYY")} ${applyTimeFormat(
    p,
    settings.time_format || "24"
  )}`;
}

/**
 * Human "time ago" label (e.g. "3h ago") — used by the notification bell and
 * chat, which historically rendered relative times. Falls back to a formatted
 * absolute time for anything older than a week.
 */
export function formatRelative(
  value: Date | string | number | null | undefined,
  settings: UserSettings
): string {
  const d = toDate(value);
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d, settings);
}

/** 0 = Sunday, 1 = Monday … feeding a calendar month-grid header. */
export function firstDayOfWeekIndex(settings: UserSettings): number {
  switch (settings.first_day_of_week) {
    case "sunday":
      return 0;
    case "saturday":
      return 6;
    case "monday":
    default:
      return 1;
  }
}

/* ── Unit conversions + formatted strings ─────────────────────────────────── */

function isImperial(settings: UserSettings): boolean {
  return (settings.units || "metric") === "imperial";
}

/** Celsius → Fahrenheit when imperial. Returns the raw value when metric. */
export function convertTemp(celsius: number, settings: UserSettings): number {
  return isImperial(settings) ? celsius * 9 / 5 + 32 : celsius;
}

/** Millimetres → inches when imperial. */
export function convertRainfall(mm: number, settings: UserSettings): number {
  return isImperial(settings) ? mm / 25.4 : mm;
}

/** Hectares → acres when imperial. */
export function convertArea(ha: number, settings: UserSettings): number {
  return isImperial(settings) ? ha * 2.47105 : ha;
}

/** Kilometres/hour → miles/hour when imperial. */
export function convertSpeed(kmh: number, settings: UserSettings): number {
  return isImperial(settings) ? kmh * 0.621371 : kmh;
}

function round(n: number, digits: number): string {
  return Number(n).toFixed(digits);
}

export function fmtTemp(
  celsius: number | null | undefined,
  settings: UserSettings,
  digits = 0
): string {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) return "—";
  return `${round(convertTemp(celsius, settings), digits)}°${isImperial(settings) ? "F" : "C"}`;
}

export function fmtRainfall(
  mm: number | null | undefined,
  settings: UserSettings,
  digits = 1
): string {
  if (mm === null || mm === undefined || Number.isNaN(mm)) return "—";
  return isImperial(settings)
    ? `${round(convertRainfall(mm, settings), 2)} in`
    : `${round(mm, digits)} mm`;
}

export function fmtArea(
  ha: number | null | undefined,
  settings: UserSettings,
  digits = 1
): string {
  if (ha === null || ha === undefined || Number.isNaN(ha)) return "—";
  return isImperial(settings)
    ? `${round(convertArea(ha, settings), 2)} acres`
    : `${round(ha, digits)} ha`;
}

export function fmtWind(
  kmh: number | null | undefined,
  settings: UserSettings,
  digits = 0
): string {
  if (kmh === null || kmh === undefined || Number.isNaN(kmh)) return "—";
  return isImperial(settings)
    ? `${round(convertSpeed(kmh, settings), 0)} mph`
    : `${round(kmh, digits)} km/h`;
}

/* ── Hook: the settings object bound to the live user settings ────────────── */

export function useSettingsFormat() {
  const { settings } = useUserSettings();
  return useMemo(
    () => ({
      settings,
      units: (settings.units || "metric") as Units,
      timezone: settings.timezone || detectTimezone(),
      firstDayOfWeek: firstDayOfWeekIndex(settings),
      formatDate: (v: Parameters<typeof formatDate>[0]) => formatDate(v, settings),
      formatTime: (v: Parameters<typeof formatTime>[0]) => formatTime(v, settings),
      formatDateTime: (v: Parameters<typeof formatDateTime>[0]) => formatDateTime(v, settings),
      formatRelative: (v: Parameters<typeof formatRelative>[0]) => formatRelative(v, settings),
      fmtTemp: (c: number | null | undefined, d?: number) => fmtTemp(c, settings, d),
      fmtRainfall: (mm: number | null | undefined, d?: number) => fmtRainfall(mm, settings, d),
      fmtArea: (ha: number | null | undefined, d?: number) => fmtArea(ha, settings, d),
      fmtWind: (kmh: number | null | undefined, d?: number) => fmtWind(kmh, settings, d),
    }),
    [settings]
  );
}
