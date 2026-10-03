"use client";

/**
 * WheatGuard AI · Weather Risk (user view)
 *
 * 100% backend-driven. Every score, risk level, factor bar, explanation,
 * recommendation and disclaimer is computed by the scoring engine on the
 * server (back/app/ml/weather_service.py) from admin-managed rules and
 * real Open-Meteo data — this component only renders the payload.
 *
 * There is no client-side risk math and no fallback numbers: if the
 * provider is down the backend returns 503 "Weather data is currently
 * unavailable." and we show that verbatim (never a fabricated score).
 *
 * Image-model confidence and weather favorability are always presented as
 * two separate values — weather risk is environmental suitability, not a
 * diagnosis and not a probability that a disease will occur.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  buildWeatherRiskPrefill,
  createReminder,
  fetchWeatherRisk,
  getCachedUserSettings,
  type ForecastDay,
  type WeatherDiseaseRisk,
  type WeatherRiskFactor,
  type WeatherRiskResponse,
} from "@/lib/api";
import { useSettingsFormat } from "@/lib/settingsFormat";

/* ---------------------------------------------------------------
   RISK PRESENTATION HELPERS (cosmetic only — thresholds come
   from the backend payload; these just pick a color per level name)
--------------------------------------------------------------- */

type Tone = {
  text: string;
  bg: string;
  border: string;
  bar: string;
  icon: string;
};

function levelTone(level: string): Tone {
  const n = level.toLowerCase();
  if (n.includes("very high"))
    return { text: "text-danger", bg: "bg-danger-soft", border: "border-danger/20", bar: "bg-red-500", icon: "dangerous" };
  if (n === "high")
    return { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", bar: "bg-orange-500", icon: "warning" };
  if (n === "moderate")
    return { text: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", bar: "bg-yellow-500", icon: "priority_high" };
  if (n === "low")
    return { text: "text-lime-700", bg: "bg-lime-50", border: "border-lime-200", bar: "bg-lime-500", icon: "shield" };
  if (n === "unavailable")
    return { text: "text-muted", bg: "bg-surface-muted", border: "border-line", bar: "bg-line", icon: "help" };
  return { text: "text-brand-800 dark:text-brand-300", bg: "bg-brand-50 dark:bg-brand-900/40", border: "border-brand-300 dark:border-brand-700", bar: "bg-brand-500", icon: "check_circle" };
}

function impactTone(impact: string): string {
  const n = impact.toLowerCase();
  if (n.startsWith("high")) return "bg-red-500";
  if (n.startsWith("moderate")) return "bg-yellow-500";
  if (n.startsWith("low")) return "bg-brand-500";
  return "bg-line"; // unavailable
}

/** Formats a possibly-null measurement; never shows a made-up number. */
function fmt(value: number | null | undefined, unit = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value}${unit}`;
}

/* ---------------------------------------------------------------
   STATE
--------------------------------------------------------------- */

export function WeatherView() {
  const [data, setData] = useState<WeatherRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeLocation, setActiveLocation] = useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [focusDisease, setFocusDisease] = useState<string>("");

  // Only `reloadKey`/`activeLocation` changes re-run this. Every setState
  // happens after an `await` (never synchronously in the effect body), so
  // the loader/initial state drive the first paint without a cascade.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await fetchWeatherRisk(activeLocation);
        if (!alive) return;
        setData(result);
        setError("");
        const top = result.disease_risks.find((d) => d.weather_risk_score !== null);
        setFocusDisease(top?.disease_key ?? result.disease_risks[0]?.disease_key ?? "");
      } catch (e: unknown) {
        // Backend returns the exact "Weather data is currently unavailable."
        // on provider failure — surface it verbatim, never render fake data.
        if (!alive) return;
        setData(null);
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Weather data is currently unavailable."
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [activeLocation, reloadKey]);

  // Re-fetch helpers trigger loading from the event handler (not the effect).
  const refetch = (location?: string) => {
    setLoading(true);
    if (location !== undefined) setActiveLocation(location);
    else setReloadKey((k) => k + 1);
  };

  const diseases = useMemo(() => data?.disease_risks ?? [], [data]);
  const scored = useMemo(
    () => diseases.filter((d) => d.weather_risk_score !== null),
    [diseases]
  );
  const focus = useMemo(
    () => diseases.find((d) => d.disease_key === focusDisease) ?? scored[0] ?? diseases[0] ?? null,
    [diseases, focusDisease, scored]
  );

  // Forecast horizon the user chose in Settings → Weather (the provider returns
  // up to 7 days, so we only ever show 3 / 5 / 7 — never invent longer ranges).
  const forecastPeriod = getCachedUserSettings().weather_preferences?.forecast_period ?? "7d";
  const forecastDays = (() => {
    const n = parseInt(forecastPeriod, 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 3), 7) : 7;
  })();
  const visibleForecast = useMemo(
    () => (data?.forecast ?? []).slice(0, forecastDays),
    [data, forecastDays]
  );

  /* ---------------------------------------------------------------
     RENDER
  --------------------------------------------------------------- */

  return (
    <div className="mx-auto w-full max-w-6xl animate-slide-up space-y-6 overflow-x-hidden p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">
            Weather Risk Analysis
          </h1>
          <p className="mt-1 text-sm text-muted">
            Disease-specific environmental favorability, calculated live from
            real weather data and admin-configured agronomy rules.
          </p>
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            refetch(search.trim() || undefined);
          }}
        >
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-lg">
              location_on
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a town / field…"
              className="w-56 rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            Go
          </button>
        </form>
      </div>

      {/* Location source chip */}
      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 font-medium text-ink">
            <span className="material-symbols-outlined text-sm">location_on</span>
            {data.location.label}
          </span>
          <span className="rounded-full bg-surface-muted px-3 py-1 capitalize">
            source: {data.location.source}
          </span>
          <span className="rounded-full bg-surface-muted px-3 py-1">
            updated {new Date(data.generated_at).toLocaleString()}
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingState />}

      {/* Hard error — no fabricated numbers, ever */}
      {!loading && error && <ErrorState message={error} onRetry={() => refetch()} />}

      {/* Content */}
      {!loading && !error && data && (
        <>
          {/* Alerts */}
          {data.alerts.length > 0 && (
            <div className="space-y-2">
              {data.alerts.map((a, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800"
                >
                  <span className="material-symbols-outlined text-lg text-orange-500">
                    notifications_active
                  </span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {/* §8 Current Weather */}
          <CurrentWeatherCard data={data} />

          {/* §10 Your prediction + its independent weather risk */}
          <YourPredictionCard data={data} />

          {/* §9 Disease Weather Impact cards */}
          <section>
            <SectionTitle
              icon="bug_report"
              title="Disease Weather Impact"
              subtitle="How favorable today's conditions are for each tracked disease."
            />
            {diseases.length === 0 ? (
              <EmptyNote>No disease weather rules are configured yet.</EmptyNote>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {diseases.map((d) => (
                  <DiseaseImpactCard key={d.disease_key} disease={d} />
                ))}
              </div>
            )}
          </section>

          {/* §11 All-disease overview comparison (Healthy → —) */}
          <section>
            <SectionTitle
              icon="leaderboard"
              title="Disease Risk Overview"
              subtitle="Today's weather favorability ranked across every disease."
            />
            <RiskOverview diseases={diseases} />
          </section>

          {/* §24–26 Weather → monitoring reminder suggestion (never auto-created) */}
          <WeatherReminderSuggestion diseases={scored} />

          {/* §12 forecast with disease switcher (horizon honours user setting) */}
          <section>
            <SectionTitle
              icon="calendar_month"
              title={`${forecastDays}-Day Weather Risk Forecast`}
              subtitle="The same scoring engine, projected across the coming days."
            />
            {scored.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {scored.map((d) => (
                  <button
                    key={d.disease_key}
                    type="button"
                    onClick={() => setFocusDisease(d.disease_key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      focus?.disease_key === d.disease_key
                        ? "bg-brand-700 text-white"
                        : "bg-surface text-ink ring-1 ring-line hover:bg-surface-muted"
                    }`}
                  >
                    {d.disease_name}
                  </button>
                ))}
              </div>
            )}
            <ForecastStrip forecast={visibleForecast} focusKey={focus?.disease_key} />
          </section>

          {/* §13 Why is this risk level shown? */}
          {focus && (
            <section>
              <SectionTitle
                icon="help"
                title="Why is this risk level shown?"
                subtitle={`Reasoning for ${focus.disease_name}.`}
              />
              <WhyCard focus={focus} />
            </section>
          )}

          {/* §20 General recommendations */}
          <section>
            <SectionTitle
              icon="recommendation"
              title="General Recommendations"
              subtitle="Monitoring guidance based on current environmental favorability."
            />
            <div className="rounded-2xl border border-line bg-surface p-5">
              <ul className="space-y-2.5">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink">
                    <span className="material-symbols-outlined mt-0.5 text-lg text-brand-700 dark:text-brand-300">
                      checklist
                    </span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface-muted px-4 py-3 text-xs leading-relaxed text-muted">
            <span className="material-symbols-outlined text-base text-muted">
              info
            </span>
            <span>{data.disclaimer}</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   SUB-COMPONENTS
--------------------------------------------------------------- */

/**
 * When today's weather is High / Very High favourable for one or more
 * diseases, offer the farmer an optional scouting / monitoring reminder.
 * Nothing is created automatically — each reminder is only written when the
 * user explicitly taps the button (spec §6–9, §24–26). Weather favorability is
 * never presented as a confirmed detection.
 */
function WeatherReminderSuggestion({ diseases }: { diseases: WeatherDiseaseRisk[] }) {
  const risky = useMemo(
    () =>
      diseases
        .filter((d) => /very high|^high$|\bhigh\b/i.test(d.risk_level))
        .slice(0, 3),
    [diseases]
  );
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (risky.length === 0) return null;
  // Honor Settings → Calendar "Suggest weather follow-ups" — when off, the
  // monitoring-reminder proposal surface is hidden entirely.
  if (getCachedUserSettings().calendar_preferences?.suggest_weather_followup === false) return null;

  const add = async (d: WeatherDiseaseRisk) => {
    setBusy(d.disease_key);
    setError(null);
    try {
      await createReminder(buildWeatherRiskPrefill(d.disease_name));
      setAdded((m) => ({ ...m, [d.disease_key]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the reminder.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <SectionTitle
        icon="event_available"
        title="Suggested monitoring reminders"
        subtitle="Weather alone does not mean disease is present — but these conditions raise the risk. Choose to be reminded to check."
      />
      <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
        {risky.map((d) => (
          <div key={d.disease_key} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {d.disease_name} · {d.risk_level} favorability
              </p>
              <p className="text-xs text-ink">
                Weather conditions are favorable for increased {d.disease_name} risk.
              </p>
            </div>
            {added[d.disease_key] ? (
              <Link href="/dashboard/calendar" className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
                <span className="material-symbols-outlined text-base">check_circle</span> Added · view calendar
              </Link>
            ) : (
              <button
                type="button"
                disabled={busy === d.disease_key}
                onClick={() => void add(d)}
                className="inline-flex items-center gap-1 rounded-xl border border-indigo-300 bg-surface px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-base">add_alert</span>
                {busy === d.disease_key ? "Adding…" : "Remind me to scout"}
              </button>
            )}
          </div>
        ))}
        {error ? <p className="text-xs text-danger" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="material-symbols-outlined mt-0.5 text-2xl text-brand-800 dark:text-brand-300">{icon}</span>
      <div>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-danger/20 bg-danger-soft px-6 py-14 text-center">
      <span className="material-symbols-outlined mb-3 text-[44px] text-red-400">
        cloud_off
      </span>
      <h3 className="text-base font-bold text-danger">{message}</h3>
      <p className="mt-1 max-w-sm text-sm text-danger/80">
        We never show estimated weather risk. Please try again in a moment.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
      >
        <span className="material-symbols-outlined text-lg">refresh</span>
        Try again
      </button>
    </div>
  );
}

/* §8 Current weather grid */
function CurrentWeatherCard({ data }: { data: WeatherRiskResponse }) {
  const c = data.current;
  const { fmtTemp, fmtRainfall, fmtWind } = useSettingsFormat();
  const tiles: Array<{ icon: string; label: string; value: string }> = [
    { icon: "thermometer", label: "Temperature", value: fmtTemp(c.temperature) },
    { icon: "device_thermostat", label: "Feels like", value: fmtTemp(c.feels_like) },
    { icon: "water_drop", label: "Humidity", value: fmt(c.humidity, "%") },
    { icon: "rainfall", label: "Rainfall 24h", value: fmtRainfall(c.rainfall_24h) },
    { icon: "wind_power", label: "Wind", value: `${fmtWind(c.wind_speed)} ${c.wind_direction ?? ""}`.trim() },
    { icon: "cloud", label: "Cloud cover", value: fmt(c.cloud_cover, "%") },
    { icon: "dew_point", label: "Dew point", value: fmtTemp(c.dew_point) },
  ];

  return (
    <section>
      <SectionTitle
        icon="partly_cloudy_day"
        title="Current Weather"
        subtitle="Live conditions at the analysed location."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className="material-symbols-outlined text-lg text-brand-700 dark:text-brand-300">{t.icon}</span>
              {t.label}
            </div>
            <p className="mt-2 text-xl font-bold text-ink">{t.value}</p>
          </div>
        ))}
        {/* Leaf wetness — honest "unavailable" chip */}
        <div className="rounded-2xl border border-dashed border-line bg-surface-muted p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="material-symbols-outlined text-lg text-muted">opacity</span>
            Leaf wetness
          </div>
          <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-muted">
            <span className="rounded-full bg-line px-2 py-0.5 text-xs">Unavailable</span>
          </p>
        </div>
      </div>
    </section>
  );
}

/* §10 Your prediction block — model confidence vs weather risk kept separate */
function YourPredictionCard({ data }: { data: WeatherRiskResponse }) {
  const yp = data.your_prediction;

  if (!yp) {
    return (
      <section>
        <SectionTitle
          icon="biotech"
          title="Your Prediction"
          subtitle="Personalised weather risk for your latest diagnosis."
        />
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[28px] text-slate-300">image_search</span>
            <div>
              <p className="text-sm font-semibold text-ink">No prediction yet</p>
              <p className="text-xs text-muted">
                Run a leaf scan to see the weather risk for your specific diagnosis.
              </p>
            </div>
          </div>
          <a
            href="/dashboard/predict"
            className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            Start a diagnosis
          </a>
        </div>
      </section>
    );
  }

  const tone = levelTone(yp.weather_risk_level);

  return (
    <section>
      <SectionTitle
        icon="biotech"
        title="Your Prediction & Weather Risk"
        subtitle="Image diagnosis and environmental favorability are separate values."
      />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {/* Model side */}
          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Image model prediction
            </p>
            <p className="mt-1 text-lg font-bold text-ink">{yp.disease_name}</p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <div>
                <p className="text-xs text-muted">Model confidence</p>
                <p className="font-semibold text-ink">{Math.round(yp.model_confidence_pct)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted">Severity</p>
                <p className="font-semibold text-ink">{yp.severity || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Predicted</p>
                <p className="font-semibold text-ink">
                  {new Date(yp.predicted_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Weather side */}
          <div className={`p-5 ${tone.bg}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Weather risk for this disease
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-lg font-bold text-ink">{yp.weather_risk_level}</p>
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold ${tone.text} ${tone.border} bg-white/70`}>
                <span className={`h-2 w-2 rounded-full ${tone.bar}`} />
                {yp.weather_risk_score === null ? "N/A" : `${yp.weather_risk_score}/100`}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink">{yp.explanation}</p>
          </div>
        </div>

        {yp.factors.length > 0 && (
          <div className="border-t border-line p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Contributing factors
            </p>
            <div className="space-y-2.5">
              {yp.factors.map((f) => (
                <FactorBar key={f.factor_key} factor={f} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* §9 Disease impact card */
function DiseaseImpactCard({ disease }: { disease: WeatherDiseaseRisk }) {
  const tone = levelTone(disease.risk_level);
  const isHealthy = /healthy/i.test(disease.disease_key);

  return (
    <div className={`rounded-2xl border bg-surface p-5 ${tone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-ink">{disease.disease_name}</h3>
          {disease.scientific_name && (
            <p className="truncate text-xs italic text-muted">{disease.scientific_name}</p>
          )}
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${tone.text} ${tone.bg} ${tone.border}`}>
          <span className="material-symbols-outlined text-sm">{tone.icon}</span>
          {disease.risk_level}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <p className={`text-3xl font-black ${tone.text}`}>
          {isHealthy ? "—" : disease.weather_risk_score === null ? "—" : disease.weather_risk_score}
        </p>
        {!isHealthy && disease.weather_risk_score !== null && (
          <span className="text-xs text-muted">/ 100 favorability</span>
        )}
      </div>

      {disease.factors.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {disease.factors.map((f) => (
            <FactorBar key={f.factor_key} factor={f} />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink">{disease.explanation}</p>
    </div>
  );
}

function FactorBar({ factor }: { factor: WeatherRiskFactor }) {
  const pct =
    factor.favorability === null ? 0 : Math.round(factor.favorability * 100);
  const unavailable = factor.value === null || /unavailable/i.test(factor.impact);

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink">{factor.name}</span>
        <span className="text-muted">
          {unavailable ? (
            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-muted">
              Not measured
            </span>
          ) : (
            <>
              {fmt(factor.value, factor.unit)}{" "}
              <span className="text-muted">· favor {factor.range}</span>
            </>
          )}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full ${impactTone(factor.impact)} transition-all`}
          style={{ width: `${unavailable ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}

/* §11 Overview comparison */
function RiskOverview({ diseases }: { diseases: WeatherDiseaseRisk[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Disease</th>
            <th className="px-4 py-2.5 font-semibold">Risk level</th>
            <th className="px-4 py-2.5 font-semibold">Score</th>
            <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Favorability</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {diseases.map((d) => {
            const tone = levelTone(d.risk_level);
            const healthy = /healthy/i.test(d.disease_key);
            const score = d.weather_risk_score;
            return (
              <tr key={d.disease_key} className="hover:bg-surface-muted">
                <td className="px-4 py-3 font-semibold text-ink">{d.disease_name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${tone.text} ${tone.bg} ${tone.border}`}>
                    {healthy ? "—" : d.risk_level}
                  </span>
                </td>
                <td className="px-4 py-3 font-bold text-ink">
                  {healthy || score === null ? "—" : `${score}/100`}
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <div className="h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={`h-full rounded-full ${tone.bar}`}
                      style={{ width: healthy || score === null ? "0%" : `${score}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* §13 Why is this risk level shown? */
function WhyCard({ focus }: { focus: WeatherDiseaseRisk }) {
  const tone = levelTone(focus.risk_level);
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${tone.text} ${tone.bg} ${tone.border}`}>
          {focus.disease_name}: {focus.risk_level}
        </span>
        <span className="text-xs text-muted">
          {focus.weather_risk_score === null ? "score unavailable" : `score ${focus.weather_risk_score}/100`}
        </span>
      </div>
      <ul className="space-y-2">
        {focus.reasons.length === 0 ? (
          <li className="text-sm text-muted">{focus.explanation}</li>
        ) : (
          focus.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink">
              <span className="material-symbols-outlined mt-0.5 text-base text-brand-700 dark:text-brand-300">
                arrow_right
              </span>
              <span>{r}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/* §12 7-day forecast strip with per-disease switcher */
function ForecastStrip({ forecast, focusKey }: { forecast: ForecastDay[]; focusKey?: string }) {
  const { fmtTemp, fmtRainfall } = useSettingsFormat();
  if (!forecast.length) {
    return <EmptyNote>No forecast available for this location.</EmptyNote>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {forecast.map((day) => {
        const point = focusKey
          ? day.per_disease.find((p) => p.disease_key === focusKey) ?? null
          : day.highest_risk;
        const label = point?.risk_level ?? "Unavailable";
        const tone = levelTone(label);
        return (
          <div
            key={day.date}
            className={`rounded-2xl border bg-surface p-3 ${day.is_today ? "ring-2 ring-brand-500/40" : ""}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-ink">
                {day.is_today ? "Today" : day.day_name}
              </p>
              <span className={`h-2.5 w-2.5 rounded-full ${tone.bar}`} />
            </div>
            <p className="mt-0.5 text-xs text-muted">{day.date}</p>

            <div className="my-2 flex items-center gap-1 text-xs text-muted">
              <span className="material-symbols-outlined text-sm">thermostat</span>
              {fmtTemp(day.temp_high)} / {fmtTemp(day.temp_low)}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted">
              <span className="material-symbols-outlined text-sm">water_drop</span>
              {fmt(day.humidity_avg, "%")}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted">
              <span className="material-symbols-outlined text-sm">rainfall</span>
              {fmtRainfall(day.rainfall)}
            </div>

            <div className={`mt-3 rounded-lg px-2 py-1.5 text-center ${tone.bg}`}>
              <p className={`text-xs font-bold ${tone.text}`}>{label}</p>
              {point?.weather_risk_score != null && (
                <p className="text-xs text-muted">{point.weather_risk_score}/100</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
