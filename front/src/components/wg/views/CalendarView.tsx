"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast, SelectMenu } from "@/components/wg/ui";
import { useScrollLock } from "@/lib/useScrollLock";

import {
  ApiError,
  getCachedUserSettings,
  completeReminder,
  createReminder,
  deleteReminder,
  fetchAllCalendarReminders,
  fetchAllCalendarScans,
  recordActivityEvent,
  rescheduleReminder,
  snoozeReminder,
  sweepReminders,
  updateReminder,
  type CalendarReminder,
  type CalendarScanEntry,
  type ReminderCategory,
  type ReminderCreateInput,
  type ReminderPriority,
  type ReminderRepeat,
  type ReminderStatus,
} from "@/lib/api";
import {
  useSettingsFormat,
  formatTime as fmtTimeSettings,
} from "@/lib/settingsFormat";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

type ViewMode = "daily" | "weekly" | "monthly" | "yearly";
type CategoryFilter = "all" | ReminderCategory;
type StatusFilter = "all" | ReminderStatus;
type PriorityFilter = "all" | ReminderPriority;

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

// Category → display + icon (Material Symbols) + accent classes (spec §33 legend).
const CATEGORY_META: Record<
  ReminderCategory,
  { label: string; icon: string; text: string; badge: string; dot: string }
> = {
  scan: { label: "Scan", icon: "qr_code_scanner", text: "text-sky-600", badge: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  disease: { label: "Disease Monitoring", icon: "pest_control", text: "text-rose-600", badge: "bg-rose-100 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  weather: { label: "Weather Risk", icon: "thunderstorm", text: "text-indigo-600", badge: "bg-indigo-100 text-indigo-700 border-indigo-200", dot: "bg-indigo-500" },
  farm: { label: "Farm Activity", icon: "agriculture", text: "text-brand-700 dark:text-brand-300", badge: "bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-300 border-brand-300 dark:border-brand-700", dot: "bg-brand-500" },
  general: { label: "Reminder", icon: "event_available", text: "text-violet-600", badge: "bg-violet-100 text-violet-700 border-violet-200", dot: "bg-violet-500" },
};
const CATEGORY_ORDER: ReminderCategory[] = ["scan", "disease", "weather", "farm", "general"];

const PRIORITY_META: Record<ReminderPriority, { label: string; badge: string }> = {
  low: { label: "Low", badge: "bg-surface-muted text-ink border-line" },
  medium: { label: "Medium", badge: "bg-warning-soft dark:bg-warning/15 text-warning border-warning/30" },
  high: { label: "High", badge: "bg-danger-soft text-danger border-danger/20" },
};

function catMeta(cat?: ReminderCategory) {
  return CATEGORY_META[cat ?? "general"];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message || "Something went wrong.";
  if (error instanceof Error) return error.message || "Something went wrong.";
  return "Something went wrong. Please try again.";
}

function getMonthGrid(year: number, month: number, firstDow = 0): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() - firstDow + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** WEEKDAYS reordered so the displayed week starts on the user's chosen day. */
function rotatedWeekdays(firstDow: number): string[] {
  const arr: string[] = [...WEEKDAYS];
  return [...arr.slice(firstDow), ...arr.slice(0, firstDow)];
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function getViewRange(mode: ViewMode, anchor: Date): { from: string; to: string } {
  if (mode === "daily") {
    const key = isoDateLocal(anchor);
    return { from: key, to: key };
  }
  if (mode === "weekly") {
    const start = addDays(anchor, -anchor.getDay());
    const end = addDays(start, 6);
    return { from: isoDateLocal(start), to: isoDateLocal(end) };
  }
  if (mode === "yearly") {
    const y = anchor.getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const mm = String(m + 1).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

function formatPeriodLabel(mode: ViewMode, anchor: Date): string {
  if (mode === "daily") {
    return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (mode === "weekly") {
    const { from, to } = getViewRange("weekly", anchor);
    const a = new Date(from + "T12:00:00");
    const b = new Date(to + "T12:00:00");
    return `${a.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${b.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (mode === "yearly") return String(anchor.getFullYear());
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function severityRank(severity?: string): number {
  const v = (severity ?? "").toLowerCase();
  if (v.includes("critical") || v.includes("high") || v.includes("severe")) return 3;
  if (v.includes("medium") || v.includes("moderate")) return 2;
  return 1;
}

function getSeverityDotClass(severity?: string): string {
  const rank = severityRank(severity);
  if (rank >= 3) return "bg-red-500";
  if (rank === 2) return "bg-amber-500";
  return "bg-brand-500";
}

function getSeverityClass(severity?: string) {
  const v = (severity ?? "").toLowerCase();
  if (v.includes("high") || v.includes("severe") || v.includes("critical")) return "bg-danger-soft text-danger border-danger/20";
  if (v.includes("medium") || v.includes("moderate")) return "bg-warning-soft dark:bg-warning/15 text-warning border-warning/30";
  return "bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-300 border-brand-300 dark:border-brand-700";
}

function formatDisease(name: string) {
  const text = name.replace(/_/g, " ").trim() || "Unknown";
  return text.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function formatTime(iso?: string | null) {
  if (!iso) return "—";
  return fmtTimeSettings(iso, getCachedUserSettings()) || "—";
}

function formatDayLabel(dateKey: string) {
  const d = new Date(dateKey + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

function worstSeverity(scans: CalendarScanEntry[]): string {
  if (!scans.length) return "low";
  return scans.reduce((best, s) => (severityRank(s.severity) > severityRank(best) ? s.severity : best), scans[0].severity);
}

function inDateRange(dateKey: string, from: string, to: string): boolean {
  return dateKey >= from && dateKey <= to;
}

function rDate(r: CalendarReminder): string {
  return String(r.date).slice(0, 10);
}

function rTime(r: CalendarReminder): string {
  return r.reminder_time ? String(r.reminder_time).slice(0, 5) : "";
}

function displayWhen(r: CalendarReminder): string {
  return rTime(r) ? `${formatDayLabel(rDate(r))} · ${rTime(r)}` : formatDayLabel(rDate(r));
}

// ── Reminder add / edit form modal (spec §5) ──────────────────────────────────

type FormInitial = Partial<ReminderCreateInput> & { id?: string | number };

// Settings → Calendar "default lead time" maps to notification minutes so new
// reminders open pre-filled with the farmer's preferred head start.
const LEAD_TIME_MINUTES: Record<string, number> = {
  none: 0,
  "1h": 60,
  "1d": 1440,
  "2d": 2880,
  "1w": 10080,
};

function defaultLeadOffsetMinutes(): number {
  const lt = getCachedUserSettings().calendar_preferences?.default_lead_time;
  return (lt && LEAD_TIME_MINUTES[lt]) || 0;
}

function emptyForm(): ReminderCreateInput {
  return {
    date: isoDateLocal(new Date()),
    title: "",
    note: "",
    category: "general",
    priority: "medium",
    reminder_time: "",
    notification_enabled: true,
    notification_offset: defaultLeadOffsetMinutes(),
    repeat_rule: "none",
    repeat_interval_days: null,
  };
}

function ReminderFormModal({
  mode,
  initial,
  onClose,
  onDone,
}: {
  mode: "create" | "edit";
  initial: FormInitial;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  // Keep the calendar page behind the sheet from scrolling.
  const lockRef = useScrollLock();
  const [form, setForm] = useState<ReminderCreateInput>(() => ({ ...emptyForm(), ...initial }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ReminderCreateInput>(key: K, value: ReminderCreateInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validate = (): string | null => {
    if (!form.title.trim()) return "Enter a title for the reminder.";
    if (form.title.trim().length > 200) return "Title must be 200 characters or fewer.";
    if (!form.date || Number.isNaN(new Date(form.date + "T12:00:00").getTime())) return "Choose a valid date.";
    if (form.note && form.note.length > 1000) return "Note must be 1000 characters or fewer.";
    if (form.repeat_rule === "custom") {
      const n = form.repeat_interval_days;
      if (n == null || !Number.isFinite(n) || n < 1 || n > 3650) return "Custom repeat needs an interval of 1–3650 days.";
    }
    if ((form.notification_offset ?? 0) < 0 || (form.notification_offset ?? 0) > 10080) {
      return "Notification lead time must be between 0 and 10080 minutes.";
    }
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: ReminderCreateInput = {
        ...form,
        title: form.title.trim(),
        note: form.note?.trim() || undefined,
        reminder_time: form.reminder_time || null,
        repeat_interval_days: form.repeat_rule === "custom" ? form.repeat_interval_days ?? null : null,
        source: (initial.source as ReminderCreateInput["source"]) ?? "manual",
        related_prediction_id: initial.related_prediction_id ?? null,
        related_disease: initial.related_disease ?? null,
        related_weather_risk_disease: initial.related_weather_risk_disease ?? null,
      };
      if (mode === "edit" && initial.id != null) {
        await updateReminder(initial.id, payload as Parameters<typeof updateReminder>[1]);
        toast.success({ title: "Reminder updated" });
      } else {
        await createReminder(payload);
        toast.success({ title: "Reminder created" });
      }
      onDone();
    } catch (err) {
      const m = getErrorMessage(err);
      setError(m);
      toast.error({ title: mode === "edit" ? "Couldn't update reminder" : "Couldn't create reminder", message: m });
      setSaving(false);
    }
  };

  const field = "w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-brand-400 dark:border-brand-500 focus:outline-none";
  const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

  return (
    <div ref={lockRef} className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{mode === "edit" ? "Edit reminder" : "Add reminder"}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-surface-muted" aria-label="Close">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          <div>
            <label className={label}>Title *</label>
            <input className={field} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Apply fungicide" maxLength={220} />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea className={field} rows={2} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Optional details" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Date *</label>
              <input type="date" className={field} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div>
              <label className={label}>Time</label>
              <input type="time" className={field} value={form.reminder_time ?? ""} onChange={(e) => set("reminder_time", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Category</label>
              <select className={field} value={form.category} onChange={(e) => set("category", e.target.value as ReminderCategory)}>
                {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Priority</label>
              <select className={field} value={form.priority} onChange={(e) => set("priority", e.target.value as ReminderPriority)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Repeat</label>
              <select className={field} value={form.repeat_rule} onChange={(e) => set("repeat_rule", e.target.value as ReminderRepeat)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom (every N days)</option>
              </select>
            </div>
            {form.repeat_rule === "custom" ? (
              <div>
                <label className={label}>Every (days)</label>
                <input type="number" min={1} max={3650} className={field} value={form.repeat_interval_days ?? ""} onChange={(e) => set("repeat_interval_days", e.target.value ? Number(e.target.value) : null)} />
              </div>
            ) : (
              <div>
                <label className={label}>Notify me</label>
                <select
                  className={field}
                  value={String(form.notification_offset ?? 0)}
                  onChange={(e) => set("notification_offset", Number(e.target.value))}
                >
                  <option value="0">At reminder time</option>
                  <option value="30">15 min before</option>
                  <option value="60">1 hour before</option>
                  <option value="180">3 hours before</option>
                  <option value="1440">1 day before</option>
                  <option value="2880">2 days before</option>
                  <option value="10080">1 week before</option>
                </select>
              </div>
            )}
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-line bg-surface-muted px-3 py-2.5">
            <input type="checkbox" checked={form.notification_enabled ?? true} onChange={(e) => set("notification_enabled", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            <span className="text-sm text-ink">
              Send me a notification (in-app{form.reminder_time ? " and email" : " and email"}) when this is due
            </span>
          </label>

          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-line px-5 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-line bg-surface py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void submit()} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reminder detail modal (spec §10–14) ───────────────────────────────────────

function ReminderDetailModal({
  reminder,
  onClose,
  onMutated,
  onEdit,
}: {
  reminder: CalendarReminder;
  onClose: () => void;
  onMutated: () => void;
  onEdit: (r: CalendarReminder) => void;
}) {
  const toast = useToast();
  // Keep the calendar page behind the sheet from scrolling.
  const lockRef = useScrollLock();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [customSnooze, setCustomSnooze] = useState("");
  const [reschedDate, setReschedDate] = useState(rDate(reminder));
  const [reschedTime, setReschedTime] = useState(rTime(reminder));

  const meta = catMeta(reminder.category);
  const done = reminder.status === "completed";

  const run = async (
    fn: () => Promise<unknown>,
    close = true,
    success?: { title: string; message?: string }
  ) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onMutated();
      if (success) toast.success(success);
      if (close) onClose();
    } catch (err) {
      const m = getErrorMessage(err);
      setError(m);
      toast.error({ title: "Action failed", message: m });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={lockRef} className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${meta.badge} border`}>
              <span className={`material-symbols-outlined ${meta.text}`}>event_available</span>
            </span>
            <div>
              <h2 className={`text-lg font-bold ${done ? "text-muted line-through" : "text-ink"}`}>{reminder.title}</h2>
              <p className="text-sm text-muted">{displayWhen(reminder)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-surface-muted" aria-label="Close">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}>
              <span className={`material-symbols-outlined ${meta.text}`} style={{ fontSize: 14 }}>{meta.icon}</span>
              {meta.label}
            </span>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_META[(reminder.priority as ReminderPriority) ?? "medium"].badge}`}>
              {PRIORITY_META[(reminder.priority as ReminderPriority) ?? "medium"].label}
            </span>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${done ? "border-brand-300 dark:border-brand-700 bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-300" : "border-line bg-surface-muted text-ink"}`}>
              {done ? "Completed" : "Pending"}
            </span>
            {reminder.repeat_rule && reminder.repeat_rule !== "none" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>repeat</span>
                {reminder.repeat_rule}
              </span>
            ) : null}
          </div>

          {reminder.note ? <p className="whitespace-pre-wrap text-sm text-ink">{reminder.note}</p> : null}

          {reminder.related_disease || reminder.related_weather_risk_disease ? (
            <p className="text-xs text-muted">
              Linked to <span className="font-semibold">{reminder.related_disease || reminder.related_weather_risk_disease}</span>
              {reminder.source === "weather_risk" ? " — weather conditions only, not a confirmed detection." : "."}
            </p>
          ) : null}

          {snoozeOpen ? (
            <div className="rounded-xl border border-line bg-surface-muted p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Snooze until</p>
              <div className="flex flex-wrap gap-2">
                {(["today", "tomorrow", "in3d", "in7d"] as const).map((u) => (
                  <button key={u} type="button" disabled={busy} onClick={() => void run(() => snoozeReminder(reminder.id, { until: u }))} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-50">
                    {u === "today" ? "Later today" : u === "tomorrow" ? "Tomorrow" : u === "in3d" ? "In 3 days" : "In 7 days"}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input type="datetime-local" className="flex-1 rounded-lg border border-line px-2 py-1.5 text-sm" value={customSnooze} onChange={(e) => setCustomSnooze(e.target.value)} />
                <button type="button" disabled={busy || !customSnooze} onClick={() => void run(() => snoozeReminder(reminder.id, { until: "custom", custom_datetime: customSnooze }))} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Set</button>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-line bg-surface-muted p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Reschedule</p>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="flex-1 rounded-lg border border-line px-2 py-1.5 text-sm" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} />
              <input type="time" className="rounded-lg border border-line px-2 py-1.5 text-sm" value={reschedTime} onChange={(e) => setReschedTime(e.target.value)} />
              <button type="button" disabled={busy || !reschedDate} onClick={() => void run(() => rescheduleReminder(reminder.id, { date: reschedDate, reminder_time: reschedTime || null }))} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-50">Move</button>
            </div>
          </div>

          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        </div>

        <div className="space-y-2 border-t border-line px-5 py-4">
          {!done ? (
            <button type="button" disabled={busy} onClick={() => void run(() => completeReminder(reminder.id), true, { title: "Reminder completed" })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span> Mark completed
            </button>
          ) : null}
          <div className="flex gap-2">
            {!snoozeOpen ? (
              <button type="button" disabled={busy} onClick={() => setSnoozeOpen(true)} className="flex-1 rounded-xl border border-line bg-surface py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50">Snooze</button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => onEdit(reminder)} className="flex-1 rounded-xl border border-line bg-surface py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50">Edit</button>
            {confirmDelete ? (
              <>
                <button type="button" disabled={busy} onClick={() => void run(() => deleteReminder(reminder.id), true, { title: "Reminder deleted" })} className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm delete</button>
                <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border border-line bg-surface py-2 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className="flex-1 rounded-xl border border-danger/20 bg-surface py-2 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-50">Delete</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Day panel: scans + reminders for the selected day ─────────────────────────

function DayPanel({
  dateKey,
  label,
  scans,
  reminders,
  onClose,
  onAdd,
  onOpenReminder,
}: {
  dateKey: string;
  label: string;
  scans: CalendarScanEntry[];
  reminders: CalendarReminder[];
  onClose: () => void;
  onAdd: (dateKey: string) => void;
  onOpenReminder: (r: CalendarReminder) => void;
}) {
  // Keep the calendar page behind the panel from scrolling.
  const lockRef = useScrollLock();
  return (
    <div ref={lockRef} className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink">{label}</h2>
            <p className="text-sm text-muted">{dateKey}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-surface-muted" aria-label="Close panel">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
          {reminders.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Reminders ({reminders.length})</h3>
              <ul className="mt-2 space-y-2">
                {reminders.map((r) => {
                  const m = catMeta(r.category);
                  const done = r.status === "completed";
                  return (
                    <li key={String(r.id)}>
                      <button type="button" onClick={() => onOpenReminder(r)} className={`flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left hover:bg-surface-muted ${done ? "opacity-60" : ""}`}>
                        <span className={`mt-0.5 ${m.text}`}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>{m.icon}</span></span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-semibold ${done ? "text-muted line-through" : "text-ink"}`}>{r.title}</span>
                          {rTime(r) ? <span className="block text-xs text-muted">{rTime(r)}</span> : null}
                        </span>
                        {done ? <span className="rounded-full bg-brand-100 dark:bg-brand-900/50 px-2 py-0.5 text-xs font-bold text-brand-800 dark:text-brand-300">DONE</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {scans.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Scans ({scans.length})</h3>
              <ul className="mt-2 space-y-2">
                {scans.map((scan) => {
                  const thumb = resolveMediaUrl(scan.thumbnail_url);
                  const pid = String(scan.prediction_id);
                  return (
                    <li key={pid} className="flex gap-3 rounded-xl border border-line bg-surface-muted p-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-line">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted">
                            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>eco</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{formatDisease(scan.disease_name)}</p>
                        <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${getSeverityClass(scan.severity)}`}>{scan.severity || "—"}</span>
                        <p className="mt-1 text-xs text-muted">{formatTime(scan.created_at)}</p>
                        <Link href={`/dashboard/history/${encodeURIComponent(pid)}`} className="mt-2 inline-flex text-xs font-semibold text-brand-800 dark:text-brand-300 hover:text-brand-900 dark:text-brand-200">View full result →</Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {scans.length === 0 && reminders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
              <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 40 }}>event_busy</span>
              <p className="mt-2 text-sm text-muted">Nothing scheduled. Add a farm task like &quot;Apply fungicide&quot; or &quot;Next inspection due.&quot;</p>
            </div>
          ) : null}
        </div>

        <div className="border-t border-line px-5 py-4">
          <button type="button" onClick={() => onAdd(dateKey)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Add reminder on this day
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reminder event row (used in Upcoming / Overdue / Daily lists) ──────────────

function ReminderRow({ reminder, onClick }: { reminder: CalendarReminder; onClick: () => void }) {
  const m = catMeta(reminder.category);
  const done = reminder.status === "completed";
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-muted ${done ? "opacity-60" : ""}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${m.badge}`}>
        <span className={`material-symbols-outlined ${m.text}`} style={{ fontSize: 18 }}>{m.icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${done ? "text-muted line-through" : "text-ink"}`}>{reminder.title}</span>
        <span className="block text-xs text-muted">{displayWhen(reminder)}</span>
      </span>
      {reminder.priority === "high" ? <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="High priority" /> : null}
      {done ? <span className="shrink-0 text-brand-700 dark:text-brand-300"><span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span></span> : null}
    </button>
  );
}

function CalendarDayCell({
  cell, dateKey, dayScans, dayReminders, isToday, hasOverdue, onSelect, tall = false,
}: {
  cell: Date;
  dateKey: string;
  dayScans: CalendarScanEntry[];
  dayReminders: CalendarReminder[];
  isToday: boolean;
  hasOverdue: boolean;
  onSelect: (key: string) => void;
  tall?: boolean;
}) {
  const worst = worstSeverity(dayScans);
  const dotClass = getSeverityDotClass(worst);
  const manyScans = dayScans.length > 3;
  const minH = tall ? "min-h-[120px]" : "min-h-[84px]";

  return (
    <button
      type="button"
      onClick={() => onSelect(dateKey)}
      className={`flex ${minH} flex-col rounded-xl border border-transparent p-1.5 text-left transition-colors hover:border-line hover:bg-surface-muted`}
    >
      <span className={`mb-1 inline-flex h-7 w-7 items-center justify-center self-center rounded-full text-sm font-semibold ${isToday ? "bg-brand-600 text-white ring-2 ring-brand-200 dark:ring-brand-700 ring-offset-1" : "text-ink"}`}>
        {cell.getDate()}
      </span>
      <div className="flex flex-1 flex-col items-stretch gap-0.5">
        {dayReminders.slice(0, tall ? 6 : 2).map((r) => {
          const m = catMeta(r.category);
          return (
            <span key={String(r.id)} className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-xs font-medium ${m.badge}`}>
              <span className={`material-symbols-outlined ${m.text}`} style={{ fontSize: 12 }}>{m.icon}</span>
              <span className="truncate">{r.title}</span>
            </span>
          );
        })}
        {dayReminders.length > (tall ? 6 : 2) ? <span className="px-1 text-xs font-semibold text-muted">+{dayReminders.length - (tall ? 6 : 2)} more</span> : null}
        <div className="mt-auto flex flex-wrap items-center gap-0.5 pt-1">
          {dayScans.length > 0 && (manyScans ? (
            <span className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-bold text-white ${dotClass}`}>{dayScans.length}</span>
          ) : (
            dayScans.map((s, i) => <span key={`${s.prediction_id}-${i}`} className={`h-2 w-2 rounded-full ${getSeverityDotClass(s.severity)}`} title={formatDisease(s.disease_name)} />)
          ))}
          {hasOverdue ? <span className="ml-auto text-xs font-bold uppercase text-red-500">overdue</span> : null}
        </div>
      </div>
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function CalendarView() {
  const { firstDayOfWeek } = useSettingsFormat();
  const today = useMemo(() => new Date(), []);
  const todayKey = isoDateLocal(today);

  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  // Always start on "monthly" so the first (server) render is deterministic —
  // reading localStorage here caused a hydration mismatch. A mount effect
  // below then switches to the user's Settings → Calendar "default calendar
  // view" (validated against the four real modes).
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [mobileFilters, setMobileFilters] = useState(false);

  const [allScans, setAllScans] = useState<CalendarScanEntry[]>([]);
  const [allReminders, setAllReminders] = useState<CalendarReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "create" | "edit"; initial: FormInitial } | null>(null);
  const [detailId, setDetailId] = useState<string | number | null>(null);

  // Apply the user's saved "default calendar view" after mount (client-only
  // localStorage read — doing this during render would mismatch the SSR HTML).
  // The update is deferred a microtask so the effect body itself performs no
  // synchronous state write (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const dv = getCachedUserSettings().calendar_preferences?.default_view;
      if (dv === "daily" || dv === "weekly" || dv === "monthly" || dv === "yearly") {
        setViewMode(dv);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const period = useMemo(() => getViewRange(viewMode, anchor), [viewMode, anchor]);
  const periodLabel = useMemo(() => formatPeriodLabel(viewMode, anchor), [viewMode, anchor]);

  const showScans = categoryFilter === "all" || categoryFilter === "scan";

  const matchesFilters = useCallback((r: CalendarReminder) => {
    if (categoryFilter !== "all" && categoryFilter !== "scan" && (r.category ?? "general") !== categoryFilter) return false;
    if (categoryFilter === "scan") return false; // scans only
    if (statusFilter !== "all" && (r.status ?? "pending") !== statusFilter) return false;
    if (priorityFilter !== "all" && (r.priority ?? "medium") !== priorityFilter) return false;
    return true;
  }, [categoryFilter, statusFilter, priorityFilter]);

  const filteredReminders = useMemo(() => allReminders.filter(matchesFilters), [allReminders, matchesFilters]);
  const filteredScans = useMemo(() => allScans.filter((s) => inDateRange(s.date.slice(0, 10), period.from, period.to)), [allScans, period.from, period.to]);

  const periodReminders = useMemo(() => filteredReminders.filter((r) => inDateRange(rDate(r), period.from, period.to)), [filteredReminders, period.from, period.to]);

  const scansByDate = useMemo(() => {
    const map = new Map<string, CalendarScanEntry[]>();
    for (const s of filteredScans) { const k = s.date.slice(0, 10); const l = map.get(k) ?? []; l.push(s); map.set(k, l); }
    return map;
  }, [filteredScans]);

  const remindersByDate = useMemo(() => {
    const map = new Map<string, CalendarReminder[]>();
    for (const r of periodReminders) { const k = rDate(r); const l = map.get(k) ?? []; l.push(r); map.set(k, l); }
    return map;
  }, [periodReminders]);

  // Overdue = pending & date before today. (The Upcoming card was removed by
  // request — upcoming reminders are still visible in the calendar itself.)
  const overdue = useMemo(() => {
    const pending = filteredReminders.filter((r) => (r.status ?? "pending") === "pending");
    return pending.filter((r) => rDate(r) < todayKey).sort((a, b) => rDate(a).localeCompare(rDate(b)));
  }, [filteredReminders, todayKey]);

  const overdueByDate = useMemo(() => {
    const set = new Set(overdue.map(rDate));
    return set;
  }, [overdue]);

  const loadAll = useCallback(async () => {
    try {
      const [scanRes, reminders] = await Promise.all([fetchAllCalendarScans(), fetchAllCalendarReminders()]);
      setAllScans(scanRes.scans);
      setAllReminders(reminders);
      setUsingFallback(scanRes.usingFallback);
      setLoadError(null);
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // On open: load, then fire the idempotent due-reminder sweep (spec §21–22).
    void (async () => {
      await loadAll();
      const delivered = await sweepReminders();
      if (delivered > 0) await loadAll();
    })();
    void recordActivityEvent("calendar_opened");
  }, [loadAll]);

  const refresh = useCallback(() => {
    setLoading(true);
    void loadAll();
  }, [loadAll]);

  const openAdd = useCallback((dateKey: string) => {
    setDetailId(null);
    setForm({ mode: "create", initial: { date: dateKey } });
  }, []);

  const openEdit = useCallback((r: CalendarReminder) => {
    setDetailId(null);
    setForm({ mode: "edit", initial: { ...r, id: r.id, source: r.source } as FormInitial });
  }, []);

  const goPrev = () => setAnchor((a) => (viewMode === "daily" ? addDays(a, -1) : viewMode === "weekly" ? addDays(a, -7) : viewMode === "yearly" ? new Date(a.getFullYear() - 1, a.getMonth(), a.getDate()) : new Date(a.getFullYear(), a.getMonth() - 1, a.getDate())));
  const goNext = () => setAnchor((a) => (viewMode === "daily" ? addDays(a, 1) : viewMode === "weekly" ? addDays(a, 7) : viewMode === "yearly" ? new Date(a.getFullYear() + 1, a.getMonth(), a.getDate()) : new Date(a.getFullYear(), a.getMonth() + 1, a.getDate())));
  const goToday = () => setAnchor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const weekDays = useMemo(() => { const start = addDays(anchor, -anchor.getDay()); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }, [anchor]);
  const monthGrid = useMemo(() => getMonthGrid(anchor.getFullYear(), anchor.getMonth(), firstDayOfWeek), [anchor, firstDayOfWeek]);

  const selectedLabel = selectedDateKey ? new Date(selectedDateKey + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  const detailReminder = detailId != null ? allReminders.find((r) => String(r.id) === String(detailId)) ?? null : null;
  const dayScansForPanel = selectedDateKey && showScans ? allScans.filter((s) => s.date.slice(0, 10) === selectedDateKey) : [];
  const dayRemindersForPanel = selectedDateKey ? allReminders.filter((r) => rDate(r) === selectedDateKey && matchesFilters(r)) : [];

  const filterControls = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <SelectMenu
        ariaLabel="Category filter"
        icon="filter_list"
        className="w-full sm:w-52"
        value={categoryFilter}
        onChange={(v) => setCategoryFilter(v as CategoryFilter)}
        options={[
          { value: "all", label: "All categories" },
          { value: "scan", label: "Scans" },
          ...CATEGORY_ORDER.filter((c) => c !== "scan").map((c) => ({ value: c, label: CATEGORY_META[c].label })),
        ]}
      />
      <SelectMenu
        ariaLabel="Status filter"
        className="w-full sm:w-44"
        value={statusFilter}
        onChange={(v) => setStatusFilter(v as StatusFilter)}
        options={[
          { value: "all", label: "All statuses" },
          { value: "pending", label: "Pending" },
          { value: "completed", label: "Completed" },
        ]}
      />
      <SelectMenu
        ariaLabel="Priority filter"
        className="w-full sm:w-44"
        value={priorityFilter}
        onChange={(v) => setPriorityFilter(v as PriorityFilter)}
        options={[
          { value: "all", label: "All priorities" },
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ]}
      />
    </div>
  );

  const totalReminders = allReminders.length;
  const isEmpty = !loading && totalReminders === 0 && allScans.length === 0;

  return (
    <div className="mx-auto max-w-5xl animate-slide-up px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-muted">Plan crop activities, disease monitoring, scans and farm reminders.</p>
        </div>
        <button type="button" onClick={() => openAdd(todayKey)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Add Reminder
        </button>
      </div>

      {usingFallback ? (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning-soft dark:bg-warning/10 px-4 py-3 text-sm text-warning">
          Reminder API is not fully available on the backend — some reminders may be stored on this device until the server routes and database columns are ready.
        </div>
      ) : null}
      {loadError ? <div className="mb-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{loadError}</div> : null}

      {/* View controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {VIEW_MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setViewMode(m.id)} className={viewMode === m.id ? "rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" : "rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"}>
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setMobileFilters((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink lg:hidden">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>filter_list</span> Filters
        </button>
      </div>

      {/* Filters: drawer on mobile, inline on desktop */}
      <div className={`mb-4 ${mobileFilters ? "block" : "hidden"} lg:block`}>{filterControls}</div>

      {/* Overdue */}
      {overdue.length > 0 ? (
        <div className="mb-6">
          <section className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-danger"><span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span> Overdue ({overdue.length})</h2>
            <ul className="mt-3 space-y-2">
              {overdue.slice(0, 4).map((r) => <li key={String(r.id)}><ReminderRow reminder={r} onClick={() => setDetailId(r.id)} /></li>)}
              {overdue.length > 4 ? <li className="text-xs font-medium text-danger">+{overdue.length - 4} more overdue…</li> : null}
            </ul>
          </section>
        </div>
      ) : null}

      <div className="rounded-3xl border border-line bg-surface p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={goPrev} className="rounded-xl border border-line bg-surface px-3 py-2 text-ink hover:bg-surface-muted" aria-label="Previous period">‹</button>
            <h2 className="min-w-[10rem] text-center text-lg font-bold text-ink">{periodLabel}</h2>
            <button type="button" onClick={goNext} className="rounded-xl border border-line bg-surface px-3 py-2 text-ink hover:bg-surface-muted" aria-label="Next period">›</button>
          </div>
          <button type="button" onClick={goToday} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted">Today</button>
        </div>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 56 }}>event_note</span>
            <h3 className="text-lg font-bold text-ink">No reminders yet</h3>
            <p className="max-w-sm text-sm text-muted">Add your first farm reminder to plan scans, disease monitoring, weather checks and crop activities.</p>
            <button type="button" onClick={() => openAdd(todayKey)} className="mt-1 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Add Reminder
            </button>
          </div>
        ) : loading ? (
          <div className="flex min-h-[280px] items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3 text-muted">
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 32 }}>progress_activity</span>
              <span className="text-sm">Loading calendar…</span>
            </div>
          </div>
        ) : viewMode === "daily" ? (
          (() => {
            const dk = isoDateLocal(anchor);
            const rList = (remindersByDate.get(dk) ?? []).concat(allReminders.filter((r) => rDate(r) === dk && !inDateRange(dk, period.from, period.to)));
            const unique = Array.from(new Map(rList.map((r) => [String(r.id), r])).values()).filter(matchesFilters);
            return (
              <div>
                {unique.length === 0 && (scansByDate.get(dk) ?? []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">Nothing scheduled for {formatDayLabel(dk)}.</p>
                ) : (
                  <ul className="space-y-2">
                    {unique.map((r) => <li key={String(r.id)}><ReminderRow reminder={r} onClick={() => setDetailId(r.id)} /></li>)}
                    {(scansByDate.get(dk) ?? []).map((s) => (
                      <li key={String(s.prediction_id)} className="flex items-center justify-between rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm">
                        <span className="font-medium text-ink">{formatDisease(s.disease_name)}</span>
                        <span className="text-muted">{formatTime(s.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => openAdd(dk)} className="mt-4 w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted">Add reminder on this day</button>
              </div>
            );
          })()
        ) : viewMode === "weekly" ? (
          <div>
            <div className="grid grid-cols-7 gap-1 border-b border-line pb-2 text-center text-xs font-semibold text-muted">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {weekDays.map((cell) => {
                const dk = isoDateLocal(cell);
                return <CalendarDayCell key={dk} cell={cell} dateKey={dk} dayScans={scansByDate.get(dk) ?? []} dayReminders={remindersByDate.get(dk) ?? []} isToday={dk === todayKey} hasOverdue={overdueByDate.has(dk)} onSelect={setSelectedDateKey} />;
              })}
            </div>
          </div>
        ) : viewMode === "yearly" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {MONTH_SHORT.map((name, monthIndex) => {
              const y = anchor.getFullYear();
              const mm = String(monthIndex + 1).padStart(2, "0");
              const prefix = `${y}-${mm}-`;
              const monthScans = filteredScans.filter((s) => s.date.startsWith(prefix));
              const monthReminders = periodReminders.filter((r) => rDate(r).startsWith(prefix));
              const worst = worstSeverity(monthScans);
              return (
                <button key={name} type="button" onClick={() => { setAnchor(new Date(y, monthIndex, 1)); setViewMode("monthly"); }} className="rounded-2xl border border-line bg-surface-muted p-4 text-left transition-colors hover:border-brand-300 dark:border-brand-700 hover:bg-brand-50/40 dark:bg-brand-900/25">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">{name}</span>
                    {monthReminders.length ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">{monthReminders.length}</span> : monthScans.length ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${getSeverityDotClass(worst)}`}>{monthScans.length}</span> : <span className="text-xs text-muted">—</span>}
                  </div>
                  <p className="mt-2 text-xs text-muted">{monthReminders.length} reminder{monthReminders.length === 1 ? "" : "s"}{monthScans.length ? ` · ${monthScans.length} scan${monthScans.length === 1 ? "" : "s"}` : ""}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 border-b border-line pb-2 text-center text-xs font-semibold text-muted">{rotatedWeekdays(firstDayOfWeek).map((d) => <div key={d}>{d}</div>)}</div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {monthGrid.map((cell, idx) => {
                if (!cell) return <div key={`empty-${idx}`} className="min-h-[84px] rounded-xl bg-transparent" />;
                const dk = isoDateLocal(cell);
                return <CalendarDayCell key={dk} cell={cell} dateKey={dk} dayScans={scansByDate.get(dk) ?? []} dayReminders={remindersByDate.get(dk) ?? []} isToday={dk === todayKey} hasOverdue={overdueByDate.has(dk)} onSelect={setSelectedDateKey} />;
              })}
            </div>
          </>
        )}

        {/* Legend (spec §33) — icons + text for accessibility */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-muted">
          {CATEGORY_ORDER.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className={`material-symbols-outlined ${catMeta(c).text}`} style={{ fontSize: 15 }}>{catMeta(c).icon}</span>
              {catMeta(c).label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" /> Low/healthy</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Medium</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> High/critical</span>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Reminders notify in-app and by email when due.
      </p>

      {selectedDateKey ? (
        <DayPanel
          dateKey={selectedDateKey}
          label={selectedLabel}
          scans={dayScansForPanel}
          reminders={dayRemindersForPanel}
          onClose={() => setSelectedDateKey(null)}
          onAdd={(dk) => openAdd(dk)}
          onOpenReminder={(r) => { setSelectedDateKey(null); setDetailId(r.id); }}
        />
      ) : null}

      {detailReminder ? (
        <ReminderDetailModal
          reminder={detailReminder}
          onClose={() => setDetailId(null)}
          onMutated={refresh}
          onEdit={openEdit}
        />
      ) : null}

      {form ? (
        <ReminderFormModal
          key={`${form.mode}-${String(form.initial.id ?? form.initial.date ?? "new")}`}
          mode={form.mode}
          initial={form.initial}
          onClose={() => setForm(null)}
          onDone={() => { setForm(null); refresh(); }}
        />
      ) : null}
    </div>
  );
}
