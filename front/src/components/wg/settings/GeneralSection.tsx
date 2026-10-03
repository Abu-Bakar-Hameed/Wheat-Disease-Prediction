"use client";

/**
 * General settings — regional formatting, units and navigation defaults.
 *
 * Self-contained: owns its own fetch/save state and writes everything through
 * the single `/api/v1/users/me/settings` endpoint (partial-merge on the server).
 * Mountable both inside SettingsModal and the full-page /dashboard/settings.
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchUserSettings,
  updateUserSettings,
  type UserSettings,
} from "@/lib/api";
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  FIRST_DAY_OPTIONS,
  COMMON_TIMEZONES,
  DASHBOARD_LANDING_ROUTES,
  detectTimezone,
  type DateFormat,
  type TimeFormat,
  type FirstDayOfWeek,
} from "@/lib/settingsFormat";
import {
  AutoSaveRow,
  Banner,
  SectionIntro,
  SelectRow,
  SkeletonRows,
  ToggleRow,
  getErrorMessage,
} from "./shared";

// Only English renders today (i18n isn't wired), so we don't offer dead options.
const LANGUAGES = [{ value: "en", label: "English" }];

const AUTO = "__auto__";

export function GeneralSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({});
  const [status, setStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  const deviceTz = typeof window !== "undefined" ? detectTimezone() : "";

  useEffect(() => {
    fetchUserSettings()
      .then((s) => setSettings(s))
      .catch(() => {/* keep defaults silently */})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setDirty(true);
    setSettings((p) => ({ ...p, [key]: value }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const saved = await updateUserSettings(settings);
      setSettings(saved);
      setDirty(false);
      setStatus({ type: "success", msg: "Settings saved." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }, [settings]);

  /* Auto-save: a short debounce after any edit, the whole (partial-merged)
     settings object is PATCHed — no Save button to press. `handleSave` only
     gets a new identity when `settings` change, which is exactly when the
     debounce should (re-)arm. */
  useEffect(() => {
    if (!dirty || loading || saving) return;
    const t = setTimeout(() => void handleSave(), 800);
    return () => clearTimeout(t);
  }, [dirty, loading, saving, handleSave]);

  if (loading) return <SkeletonRows count={6} />;

  // Build the timezone choices: detected device zone first (as "Auto"), then the
  // curated list. Any stored custom zone not in the list is appended so it never
  // silently snaps back to Auto on reopen.
  const tzChoices = [
    { value: AUTO, label: `Auto-detect${deviceTz ? ` (${deviceTz})` : ""}` },
    ...COMMON_TIMEZONES.map((t) => ({ value: t.value, label: t.label })),
  ];
  const storedTz = settings.timezone ?? "";
  if (storedTz && !tzChoices.some((c) => c.value === storedTz)) {
    tzChoices.push({ value: storedTz, label: storedTz });
  }

  return (
    <div className="space-y-1">
      <SectionIntro
        title="Regional & display"
        description="How dates, times, units and the first day of the week are shown across the app."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2">
        {/* Units */}
        <div>
          <label htmlFor="pref-units" className="block text-[13px] font-medium text-ink mb-1.5">
            Units
          </label>
          <select
            id="pref-units"
            value={settings.units ?? "metric"}
            onChange={(e) => set("units", e.target.value as "metric" | "imperial")}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/60 transition"
          >
            <option value="metric">Metric (°C, mm, hectares)</option>
            <option value="imperial">Imperial (°F, in, acres)</option>
          </select>
        </div>

        {/* Language */}
        <div>
          <label htmlFor="pref-language" className="block text-[13px] font-medium text-ink mb-1.5">
            Language
          </label>
          <select
            id="pref-language"
            value={settings.language ?? "en"}
            onChange={(e) => set("language", e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/60 transition"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SelectRow
        id="gen-timezone"
        label="Time zone"
        description="Used for every date and time you see. Auto follows your device."
        value={storedTz || AUTO}
        options={tzChoices}
        onChange={(v) => set("timezone", v === AUTO ? null : v)}
      />
      <SelectRow<DateFormat>
        id="gen-dateformat"
        label="Date format"
        value={(settings.date_format as DateFormat) || "DD/MM/YYYY"}
        options={DATE_FORMAT_OPTIONS}
        onChange={(v) => set("date_format", v)}
      />
      <SelectRow<TimeFormat>
        id="gen-timeformat"
        label="Time format"
        value={(settings.time_format as TimeFormat) || "24"}
        options={TIME_FORMAT_OPTIONS}
        onChange={(v) => set("time_format", v)}
      />
      <SelectRow<FirstDayOfWeek>
        id="gen-firstday"
        label="Start of week"
        description="Sets the first column in your calendar."
        value={(settings.first_day_of_week as FirstDayOfWeek) || "monday"}
        options={FIRST_DAY_OPTIONS}
        onChange={(v) => set("first_day_of_week", v)}
      />

      <SectionIntro
        title="Navigation"
        description="Where WheatGuard opens and how it guides you."
      />

      <SelectRow
        id="gen-startpage"
        label="Default start page"
        description="The page you land on right after signing in."
        value={settings.default_start_page || "/dashboard"}
        options={DASHBOARD_LANDING_ROUTES.map((r) => ({ value: r.path, label: r.label }))}
        onChange={(v) => set("default_start_page", v)}
      />
      <ToggleRow
        id="gen-remember"
        label="Remember my last page"
        description="Open where you left off instead of the default start page."
        checked={settings.remember_last_page ?? false}
        onChange={(v) => set("remember_last_page", v)}
      />
      <ToggleRow
        id="gen-helptips"
        label="Show helpful tips"
        description="Display occasional in-context hints about new features."
        checked={settings.show_help_tips ?? true}
        onChange={(v) => set("show_help_tips", v)}
      />

      {status && (
        <div className="pt-4">
          <Banner
            type={status.type}
            message={status.msg}
            onDismiss={() => setStatus(null)}
          />
        </div>
      )}

      <AutoSaveRow saving={saving} />
    </div>
  );
}
