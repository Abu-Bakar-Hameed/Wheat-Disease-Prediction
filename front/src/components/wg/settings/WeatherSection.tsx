"use client";

/**
 * Weather & Risk settings (Settings → Weather & Risk).
 *
 * Real, view-layer controls: `show_on_dashboard` gates the weather card on the
 * dashboard, and the forecast horizon is honoured by WeatherView (the provider
 * supplies up to 7 days, so only 3 / 5 / 7 are offered — we never invent data).
 *
 * The weather-/disease-risk alert CHANNELS (in-app bell + email) are deliberately
 * NOT duplicated here — they live in Settings → Notifications so a preference has
 * exactly one source of truth. Copy keeps "weather risk" (favourability) distinct
 * from "disease probability" (the model's classification).
 */

import { WEATHER_PREF_DEFAULTS } from "@/lib/api";
import {
  AutoSaveRow,
  Banner,
  SectionIntro,
  SelectRow,
  SkeletonRows,
  ToggleRow,
} from "./shared";
import { useSettingsSection } from "./useSettingsSection";

const FORECAST_OPTIONS = [
  { value: "3d", label: "3 days" },
  { value: "5d", label: "5 days" },
  { value: "7d", label: "7 days" },
];

export function WeatherSection() {
  const { loading, saving, settings, status, setStatus, patchGroup } =
    useSettingsSection();

  if (loading) return <SkeletonRows count={3} />;

  const wp = { ...WEATHER_PREF_DEFAULTS, ...(settings.weather_preferences ?? {}) };

  return (
    <div className="space-y-1">
      <SectionIntro
        title="Weather on your dashboard"
        description="Control the live weather-risk tile and how far ahead the forecast looks. Weather risk describes how favourable conditions are for disease — it is separate from a scan's disease probability."
      />

      <ToggleRow
        id="wx-dashboard"
        label="Show weather on dashboard"
        description="Display the current conditions and disease-weather risk on your dashboard home."
        checked={wp.show_on_dashboard}
        onChange={(v) => patchGroup("weather_preferences", { show_on_dashboard: v })}
      />
      <SelectRow
        id="wx-forecast"
        label="Forecast range"
        description="How many days ahead the weather-risk forecast is shown."
        value={FORECAST_OPTIONS.some((o) => o.value === wp.forecast_period) ? wp.forecast_period : "7d"}
        options={FORECAST_OPTIONS}
        onChange={(v) => patchGroup("weather_preferences", { forecast_period: v })}
      />

      <p className="pt-3 text-[12px] leading-relaxed text-muted">
        Prefer to be alerted about high weather or disease risk? Those channels are
        managed together in <span className="font-medium text-muted">Notifications</span>.
      </p>

      {status && (
        <div className="pt-4">
          <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />
        </div>
      )}

      <AutoSaveRow saving={saving} />
    </div>
  );
}
