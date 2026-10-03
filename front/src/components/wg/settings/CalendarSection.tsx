"use client";

/**
 * Calendar & Reminders settings (Settings → Calendar & Reminders).
 *
 * Every control here is REAL and enforced server-side:
 * * `reminders_enabled` is the master switch the reminder dispatcher checks on
 *   each sweep — off means nothing fires,
 * * `email` / `in_app` pick which channels a due reminder is delivered on,
 * * `default_lead_time` pre-fills the notify offset on the new-reminder form,
 * * `suggest_prediction_followup` / `suggest_weather_followup` gate the
 *   follow-up proposal surfaces on the history and weather pages,
 * * `default_view` opens CalendarView in your chosen Daily/Weekly/Monthly/
 *   Yearly grid.
 */

import { CALENDAR_PREF_DEFAULTS } from "@/lib/api";
import {
  AutoSaveRow,
  Banner,
  SectionIntro,
  SelectRow,
  SkeletonRows,
  ToggleRow,
} from "./shared";
import { useSettingsSection } from "./useSettingsSection";

export function CalendarSection() {
  const { loading, saving, settings, status, setStatus, patchGroup } =
    useSettingsSection();

  if (loading) return <SkeletonRows count={6} />;

  const cp = { ...CALENDAR_PREF_DEFAULTS, ...(settings.calendar_preferences ?? {}) };

  return (
    <div className="space-y-1">
      <SectionIntro
        title="Reminders"
        description="Add and manage scan and task reminders on the Calendar page. These preferences control how and when they notify you."
      />

      <ToggleRow
        id="cal-enabled"
        label="Reminders"
        description="Master switch for every calendar reminder notification. Turn off to pause all reminder alerts."
        checked={cp.reminders_enabled}
        onChange={(v) => patchGroup("calendar_preferences", { reminders_enabled: v })}
      />
      <ToggleRow
        id="cal-inapp"
        label="In-app notifications"
        description="Show reminder alerts in the notification bell."
        checked={cp.in_app}
        onChange={(v) => patchGroup("calendar_preferences", { in_app: v })}
      />
      <ToggleRow
        id="cal-email"
        label="Email notifications"
        description="Also email me when a reminder is due."
        checked={cp.email}
        onChange={(v) => patchGroup("calendar_preferences", { email: v })}
      />
      <SelectRow
        id="cal-lead"
        label="Default lead time"
        description="How far ahead of a due date to notify you by default."
        value={cp.default_lead_time}
        options={[
          { value: "none", label: "At due time" },
          { value: "1h", label: "1 hour before" },
          { value: "1d", label: "1 day before" },
          { value: "2d", label: "2 days before" },
          { value: "1w", label: "1 week before" },
        ]}
        onChange={(v) => patchGroup("calendar_preferences", { default_lead_time: v })}
      />
      <ToggleRow
        id="cal-suggest-pred"
        label="Suggest prediction follow-ups"
        description="Propose a re-scan reminder after a diagnosis you save."
        checked={cp.suggest_prediction_followup}
        onChange={(v) => patchGroup("calendar_preferences", { suggest_prediction_followup: v })}
      />
      <ToggleRow
        id="cal-suggest-weather"
        label="Suggest weather follow-ups"
        description="Propose a monitoring reminder when weather risk rises."
        checked={cp.suggest_weather_followup}
        onChange={(v) => patchGroup("calendar_preferences", { suggest_weather_followup: v })}
      />
      <SelectRow
        id="cal-view"
        label="Default calendar view"
        description="The view the calendar opens in."
        value={cp.default_view}
        options={[
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly" },
        ]}
        onChange={(v) => patchGroup("calendar_preferences", { default_view: v })}
      />

      {status && (
        <div className="pt-4">
          <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />
        </div>
      )}

      <AutoSaveRow saving={saving} />
    </div>
  );
}
