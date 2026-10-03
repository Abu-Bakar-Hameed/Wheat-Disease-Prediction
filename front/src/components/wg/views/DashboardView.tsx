
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { useApp } from "@/lib/appState";

import { Button } from "@/components/wg/ui/Button";
import { Card } from "@/components/wg/ui/Card";
import { Icon } from "@/components/wg/ui/Icon";

import {
  fetchHistory,
  fetchModelCard,
  fetchStats,
  fetchWeatherRisk,
  type HistoryItem,
  type StatsResponse,
  type WeatherRiskResponse,
} from "@/lib/api";
import { useSettingsFormat } from "@/lib/settingsFormat";

/* =========================================================
   CONSTANTS
========================================================= */

/* On-brand palette built from the CSS design tokens, so charts stay
   readable in both light and dark themes. */
const PIE_COLORS = [
  "var(--color-brand-700)",
  "var(--color-brand-500)",
  "var(--color-brand-300)",
  "var(--color-wheat-500)",
  "var(--color-wheat-300)",
  "var(--color-brand-900)",
  "var(--color-wheat-700)",
];

const LINE_COLORS = {
  total: "var(--color-brand-900)",
  healthy: "var(--color-brand-500)",
  diseased: "var(--color-danger)",
};

const AXIS_TICK = { fontSize: 12, fill: "var(--color-muted)" };

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function Skeleton({
  className = "h-8 w-24",
}: {
  className?: string;
}) {
  return <div className={`wg-shimmer rounded-lg ${className}`} />;
}

/* Small card tooltip shared by the line + pie charts. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: { fill?: string } }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-md">
      {label ? (
        <p className="mb-1 text-xs font-semibold text-ink">{label}</p>
      ) : null}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-xs text-muted">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: entry.color || entry.payload?.fill }}
          />
          <span className="font-medium text-ink">{entry.name}</span>
          <span>{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/* Trend indicator: derived from real history, never fabricated. */
function TrendLine({
  delta,
  suffix = "in the last 7 days",
}: {
  delta: number | null;
  suffix?: string;
}) {
  if (delta === null || delta === 0) return null;
  const up = delta > 0;
  const display =
    Math.abs(delta) < 1
      ? `${up ? "+" : "−"}${Math.abs(delta).toFixed(1)}`
      : `${up ? "+" : "−"}${Math.abs(Math.round(delta))}`;
  return (
    <p
      className={`mt-2 flex items-center gap-1 text-xs font-medium ${
        up ? "text-success" : "text-danger"
      }`}
    >
      <span className="material-symbols-outlined text-[16px]">
        {up ? "trending_up" : "trending_down"}
      </span>
      {display}
      <span className="text-muted font-normal">{suffix}</span>
    </p>
  );
}

function MetricValue({
  value,
  suffix = "",
}: {
  value: number | null | undefined;
  suffix?: string;
}) {
  if (value === null || value === undefined) {
    return <span>—</span>;
  }

  return (
    <span>
      {value.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })}
      {suffix}
    </span>
  );
}

function formatPercentage(value: number | null) {
  if (value === null) return "—";

  return `${
    value <= 1
      ? (value * 100).toFixed(1)
      : value.toFixed(1)
  }%`;
}

function getMetric(
  card: Record<string, unknown> | null,
  names: string[]
) {
  if (!card) return null;

  for (const name of names) {
    const value = card[name];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }
  }

  return null;
}

function relativeDate(date: string) {
  const d = new Date(date);
  const now = new Date();

  const diff = Math.max(
    0,
    now.getTime() - d.getTime()
  );

  const days = Math.floor(
    diff / 86_400_000
  );

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/* =========================================================
   DASHBOARD
========================================================= */

export function DashboardView() {
  const router = useRouter();
  const { setDiagnosticTab } = useApp();
  // Display settings: imperial/metric unit conversion + the weather-tile
  // visibility preference (Settings → Weather & Risk).
  const { fmtTemp, fmtRainfall, settings: userSettings } = useSettingsFormat();
  const showWeatherOnDashboard =
    userSettings.weather_preferences?.show_on_dashboard !== false;

  /* -------------------------------------------------------
     STATE
  ------------------------------------------------------- */

  const [stats, setStats] =
    useState<StatsResponse | null>(null);

  const [history, setHistory] =
    useState<HistoryItem[]>([]);

  const [weather, setWeather] =
    useState<WeatherRiskResponse | null>(null);

  const [modelCard, setModelCard] =
    useState<Record<string, unknown> | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /* -------------------------------------------------------
     LOAD DASHBOARD DATA
  ------------------------------------------------------- */

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      const results =
        await Promise.allSettled([
          fetchStats(),

          fetchHistory({
            page: 1,
            limit: 100,
            sort: "-created_at",
          }),

          fetchWeatherRisk(),

          fetchModelCard(),
        ]);

      if (!mounted) return;

      const [
        statsResult,
        historyResult,
        weatherResult,
        modelResult,
      ] = results;

      if (
        statsResult.status === "fulfilled"
      ) {
        setStats(statsResult.value);
      }

      if (
        historyResult.status === "fulfilled"
      ) {
        setHistory(
          historyResult.value.items ?? []
        );
      }

      if (
        weatherResult.status === "fulfilled"
      ) {
        setWeather(weatherResult.value);
      }

      if (
        modelResult.status === "fulfilled"
      ) {
        setModelCard(modelResult.value);
      }

      const failed =
        results.filter(
          (result) =>
            result.status === "rejected"
        ).length;

      if (failed === results.length) {
        setError(
          "Unable to connect to the WheatGuard backend."
        );
      }

      setLoading(false);
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  /* =======================================================
     CALCULATED DATA
  ======================================================= */

  const healthRate =
    stats &&
    stats.total_predictions > 0
      ? (stats.healthy_predictions /
          stats.total_predictions) *
        100
      : 0;

  /* -------------------------------------------------------
     30 DAY CHART
  ------------------------------------------------------- */

  const chartData = useMemo(() => {
    const days = new Map<
      string,
      {
        date: string;
        label: string;
        total: number;
        healthy: number;
        diseased: number;
      }
    >();

    for (let i = 29; i >= 0; i--) {
      const date = new Date();

      date.setHours(0, 0, 0, 0);
      date.setDate(
        date.getDate() - i
      );

      const key =
        date.toISOString().slice(0, 10);

      days.set(key, {
        date: key,
        label:
          date.toLocaleDateString(
            undefined,
            {
              weekday: "short",
            }
          ),
        total: 0,
        healthy: 0,
        diseased: 0,
      });
    }

    history.forEach((item) => {
      const key = new Date(
        item.created_at
      )
        .toISOString()
        .slice(0, 10);

      const point = days.get(key);

      if (!point) return;

      point.total += 1;

      if (
        item.predicted_class
          .toLowerCase()
          .includes("healthy")
      ) {
        point.healthy += 1;
      } else {
        point.diseased += 1;
      }
    });

    return Array.from(
      days.values()
    );
  }, [history]);

  /* -------------------------------------------------------
     DISEASE DISTRIBUTION
  ------------------------------------------------------- */

  const distribution = useMemo(() => {
    const entries = Object.entries(
      stats?.class_distribution ?? {}
    )
      .map(([name, value]) => ({
        name,
        value,
      }))
      .filter(
        (item) => item.value > 0
      )
      .sort(
        (a, b) => b.value - a.value
      );

    if (entries.length) {
      return entries;
    }

    if (stats) {
      return [
        {
          name: "Healthy",
          value:
            stats.healthy_predictions,
        },
        {
          name: "Diseased",
          value:
            stats.diseased_predictions,
        },
      ].filter(
        (item) => item.value > 0
      );
    }

    return [];
  }, [stats]);

  /* -------------------------------------------------------
     WEEK-OVER-WEEK TRENDS (derived from real history)
  ------------------------------------------------------- */

  const trends = useMemo(() => {
    if (history.length === 0) {
      return { hasData: false, total: 0, healthy: 0, diseased: 0, healthRate: null as number | null };
    }

    const DAY = 86_400_000;
    let totalR = 0, totalP = 0, hlR = 0, hlP = 0, dzR = 0, dzP = 0;

    // Anchor "now" to the most recent scan so the comparison is derived purely
    // from data (no impure wall-clock read during render).
    let latest = 0;
    history.forEach((item) => {
      const t = new Date(item.created_at).getTime();
      if (!Number.isNaN(t) && t > latest) latest = t;
    });

    history.forEach((item) => {
      const t = new Date(item.created_at).getTime();
      if (Number.isNaN(t)) return;
      const age = latest - t;
      const isHealthy = item.predicted_class
        .toLowerCase()
        .includes("healthy");
      if (age <= 7 * DAY) {
        totalR += 1;
        if (isHealthy) hlR += 1; else dzR += 1;
      } else if (age <= 14 * DAY) {
        totalP += 1;
        if (isHealthy) hlP += 1; else dzP += 1;
      }
    });

    const rateR = totalR ? (hlR / totalR) * 100 : 0;
    const rateP = totalP ? (hlP / totalP) * 100 : 0;

    return {
      hasData: totalR + totalP > 0,
      total: totalR - totalP,
      healthy: hlR - hlP,
      diseased: dzR - dzP,
      // Health-rate delta only meaningful once both windows have samples.
      healthRate: totalR && totalP ? rateR - rateP : null,
    };
  }, [history]);

  /* -------------------------------------------------------
     HIGHEST DISEASE RISK
  ------------------------------------------------------- */

  const highestRisk = useMemo(() => {
    if (
      !weather?.disease_risks?.length
    ) {
      return null;
    }

    return [
      ...weather.disease_risks,
    ].sort(
      (a, b) =>
        (b.weather_risk_score ?? -1) - (a.weather_risk_score ?? -1)
    )[0];
  }, [weather]);

  /* -------------------------------------------------------
     MODEL METRICS
  ------------------------------------------------------- */

  const accuracy = getMetric(
    modelCard,
    [
      "accuracy",
      "accuracy_pct",
      "validation_accuracy",
    ]
  );

  const precision = getMetric(
    modelCard,
    [
      "precision",
      "precision_pct",
    ]
  );

  const recall = getMetric(
    modelCard,
    [
      "recall",
      "recall_pct",
    ]
  );

  const f1 = getMetric(
    modelCard,
    [
      "f1",
      "f1_score",
      "f1_pct",
    ]
  );

  /* =======================================================
     STAT CARDS
  ======================================================= */

  const statCards = [
    {
      label: "Total Predictions",
      value: stats?.total_predictions,
      icon: "analytics",
      trend: trends.hasData ? trends.total : null,
      hint: null as string | null,
    },
    {
      label: "Healthy Plants",
      value: stats?.healthy_predictions,
      icon: "eco",
      trend: trends.hasData ? trends.healthy : null,
      hint: null,
    },
    {
      label: "Diseased Plants",
      value: stats?.diseased_predictions,
      icon: "coronavirus",
      trend: trends.hasData ? trends.diseased : null,
      hint: null,
    },
    {
      label: "Crop Health Rate",
      value: healthRate,
      suffix: "%",
      icon: "health_and_safety",
      trend: trends.healthRate,
      hint: "Healthy predictions / total scans",
    },
  ];

  const goToDetection = () => {
    setDiagnosticTab("upload");
    router.push("/dashboard/detection");
  };

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-7xl animate-slide-up p-5 space-y-6 lg:p-8">

        {/* ERROR */}
        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {/* PAGE HEADER */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">
              WheatGuard AI
            </p>

            <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">
              Dashboard
            </h1>

            <p className="mt-1 max-w-prose text-sm leading-6 text-muted">
              Monitor crop health, AI predictions, disease risks and weather conditions.
            </p>
          </div>

          <Button size="lg" leftIcon="add_a_photo" onClick={goToDetection}>
            New Prediction
          </Button>
        </div>

        {/* HERO BANNER */}
        <div className="relative min-h-[160px] overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-8 shadow-sm sm:p-10">
          {/* decorative blur circles */}
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-brand-400/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-wheat-400/10 blur-3xl" />

          <div className="relative flex min-h-[160px] items-center">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                Smart Wheat Monitoring
              </p>

              <h2 className="mt-2 font-serif text-3xl font-bold leading-tight text-white sm:text-4xl">
                Healthy Crops Lead to a Prosperous Future
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-6 text-white/80">
                Use WheatGuard AI to detect wheat diseases, monitor crop health and make informed agricultural decisions.
              </p>

              <Button
                onClick={goToDetection}
                className="mt-5 border border-white/30 bg-white/10 text-white hover:border-white/50 hover:bg-white/20 active:bg-white/25"
              >
                Start AI Diagnosis
              </Button>
            </div>
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <Card key={card.label} padded interactive>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted">
                    {card.label}
                  </p>

                  <div className="mt-2 text-3xl font-bold tracking-tight text-ink">
                    {loading ? (
                      <Skeleton className="h-9 w-24" />
                    ) : (
                      <MetricValue
                        value={card.value}
                        suffix={card.suffix ?? ""}
                      />
                    )}
                  </div>

                  {!loading && <TrendLine delta={card.trend ?? null} />}

                  {card.hint && (
                    <p className="mt-2 text-xs text-muted">
                      {card.hint}
                    </p>
                  )}
                </div>

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <span className="material-symbols-outlined text-[23px]">
                    {card.icon}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* CHARTS */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Prediction Activity */}
          <Card className="xl:col-span-8" padded>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">
                  Prediction Activity
                </h2>

                <p className="mt-1 text-xs text-muted">
                  Healthy vs diseased predictions during the last 30 days.
                </p>
              </div>

              <span className="rounded-lg bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
                Last 30 Days
              </span>
            </div>

            <div className="h-[310px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid
                      stroke="var(--color-line)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="label"
                      interval={2}
                      axisLine={false}
                      tickLine={false}
                      tick={AXIS_TICK}
                    />

                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={AXIS_TICK}
                    />

                    <Tooltip content={<ChartTooltip />} />

                    <Line
                      type="monotone"
                      dataKey="total"
                      name="All Scans"
                      stroke={LINE_COLORS.total}
                      strokeWidth={2.5}
                      dot={false}
                    />

                    <Line
                      type="monotone"
                      dataKey="healthy"
                      name="Healthy"
                      stroke={LINE_COLORS.healthy}
                      strokeWidth={2.5}
                      dot={false}
                    />

                    <Line
                      type="monotone"
                      dataKey="diseased"
                      name="Diseased"
                      stroke={LINE_COLORS.diseased}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Line chart legend */}
            <div className="mt-4 flex flex-wrap gap-4">
              {[
                { name: "All Scans", color: LINE_COLORS.total },
                { name: "Healthy", color: LINE_COLORS.healthy },
                { name: "Diseased", color: LINE_COLORS.diseased },
              ].map((s) => (
                <span key={s.name} className="flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
              ))}
            </div>
          </Card>

          {/* Disease Distribution */}
          <Card className="xl:col-span-4" padded>
            <h2 className="text-base font-semibold text-ink">
              Disease Distribution
            </h2>

            <p className="mt-1 text-xs text-muted">
              Distribution of detected wheat classes.
            </p>

            <div className="h-[240px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : distribution.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted">
                  No prediction data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {distribution.map((_, index) => (
                        <Cell
                          key={index}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Custom legend list */}
            {!loading && distribution.length > 0 && (
              <ul className="mt-4 space-y-2">
                {distribution.map((entry, index) => {
                  const totalValue = distribution.reduce((s, d) => s + d.value, 0);
                  const pct = totalValue ? (entry.value / totalValue) * 100 : 0;
                  return (
                    <li key={entry.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">
                        {entry.name}
                      </span>
                      <span className="text-muted">
                        {entry.value} · {pct.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* WEATHER + RISK */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* Disease Risk */}
          <div className="rounded-xl border border-warning/25 bg-warning-soft p-5 shadow-card">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                <span className="material-symbols-outlined text-[25px]">
                  warning
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-ink">
                    Disease Risk Alert
                  </h2>

                  {highestRisk && (
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-warning">
                      {highestRisk.risk_level}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm leading-6 text-ink">
                  {highestRisk
                    ? `${highestRisk.disease_name} currently has the highest weather favorability risk (${highestRisk.risk_level}).`
                    : "Run a scan and check weather conditions to calculate the current disease risk."}
                </p>

                {weather?.alerts?.[0] && (
                  <p className="mt-2 text-xs text-muted">
                    {weather.alerts[0]}
                  </p>
                )}

                <button
                  onClick={() => router.push("/dashboard/weather")}
                  className="mt-3 text-sm font-semibold text-warning transition hover:underline focus-visible:underline"
                >
                  View Risk Analysis →
                </button>
              </div>
            </div>
          </div>

          {/* Weather */}
          {showWeatherOnDashboard && (
            <Card padded>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-ink">
                    Current Weather
                  </h2>

                  <p className="mt-1 text-xs text-muted">
                    Environmental conditions used for risk analysis.
                  </p>
                </div>

                <span className="material-symbols-outlined text-[28px] text-brand-600">
                  cloud
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-surface-muted p-3">
                  <p className="text-xs text-muted">Temperature</p>
                  <p className="mt-1 text-xl font-bold text-brand-900 dark:text-brand-200">
                    {weather ? fmtTemp(weather.current.temperature) : "—"}
                  </p>
                </div>

                <div className="rounded-xl bg-surface-muted p-3">
                  <p className="text-xs text-muted">Humidity</p>
                  <p className="mt-1 text-xl font-bold text-brand-900 dark:text-brand-200">
                    {weather ? `${weather.current.humidity}%` : "—"}
                  </p>
                </div>

                <div className="rounded-xl bg-surface-muted p-3">
                  <p className="text-xs text-muted">Rainfall</p>
                  <p className="mt-1 text-xl font-bold text-brand-900 dark:text-brand-200">
                    {weather ? fmtRainfall(weather.current.rainfall_24h) : "—"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => router.push("/dashboard/weather")}
                className="mt-4 text-sm font-semibold text-brand-700 transition hover:underline focus-visible:underline dark:text-brand-300"
              >
                Open Weather Dashboard →
              </button>
            </Card>
          )}
        </div>

        {/* RECENT PREDICTIONS + MODEL */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Recent Predictions */}
          <Card className="overflow-hidden xl:col-span-8">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="font-semibold text-ink">
                  Recent Predictions
                </h2>

                <p className="mt-1 text-xs text-muted">
                  Your latest AI wheat scans.
                </p>
              </div>

              <button
                onClick={() => router.push("/dashboard/history")}
                className="text-sm font-semibold text-brand-700 transition hover:underline focus-visible:underline dark:text-brand-300"
              >
                View All →
              </button>
            </div>

            {loading ? (
              <div className="p-5">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <Icon name="eco" size={28} />
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">
                  No scans yet
                </p>
                <p className="mt-1 max-w-prose text-sm leading-6 text-muted">
                  Upload a wheat leaf photo to get your first AI disease diagnosis.
                </p>
                <Button className="mt-4" leftIcon="add_a_photo" onClick={goToDetection}>
                  Scan your first leaf
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {history
                  .slice(0, 5)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-5 py-3 transition-colors duration-200 hover:bg-surface-muted"
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt="Wheat leaf"
                          className="h-12 w-12 rounded-lg border border-line object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success-soft text-success">
                          <span className="material-symbols-outlined">
                            eco
                          </span>
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {item.predicted_class}
                        </p>

                        <p className="mt-1 text-xs text-muted">
                          {relativeDate(item.created_at)} · {item.severity}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold text-brand-900 dark:text-brand-200">
                          {item.confidence_pct.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted">
                          confidence
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden sm:inline-flex"
                        onClick={() => {
                          // Detail route is /dashboard/history/[id]; the id the
                          // page queries by is prediction_id (falls back to id),
                          // matching how the History list links. The old
                          // /dashboard/result?id= target had no route -> 404.
                          const pid = String(
                            item.prediction_id ?? item.id ?? ""
                          );
                          router.push(
                            `/dashboard/history/${encodeURIComponent(pid)}`
                          );
                        }}
                      >
                        View Result
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          {/* AI Model */}
          <Card padded className="xl:col-span-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                <span className="material-symbols-outlined text-[24px]">
                  model_training
                </span>
              </div>

              <div>
                <h2 className="font-semibold text-ink">
                  AI Model Performance
                </h2>

                <p className="mt-1 text-xs text-muted">
                  Model evaluation metrics
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { name: "Accuracy", value: accuracy },
                { name: "Precision", value: precision },
                { name: "Recall", value: recall },
                { name: "F1 Score", value: f1 },
              ].map((metric) => (
                <div key={metric.name} className="rounded-xl bg-surface-muted p-4">
                  <p className="text-xs text-muted">
                    {metric.name}
                  </p>

                  <p className="mt-1 text-xl font-bold text-brand-900 dark:text-brand-200">
                    {formatPercentage(metric.value)}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs leading-5 text-muted">
              Metrics are displayed only when provided by the model evaluation endpoint.
            </p>
          </Card>
        </div>

        {/* MAIN ACTIONS */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Predict */}
          <button
            onClick={goToDetection}
            className="rounded-2xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-7 text-left text-white shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/40 active:scale-[0.99]"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
              <span className="material-symbols-outlined text-[27px]">
                upload
              </span>
            </div>

            <h2 className="text-2xl font-bold">
              Predict Disease
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/70">
              Upload a wheat leaf image and get an AI-powered disease diagnosis.
            </p>

            <div className="mt-5 text-sm font-semibold">
              Start Prediction →
            </div>
          </button>

          {/* History */}
          <button
            onClick={() => router.push("/dashboard/history")}
            className="rounded-2xl border border-line bg-surface p-7 text-left text-brand-900 shadow-sm transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-surface-muted hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/25 active:scale-[0.99] dark:text-brand-100"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              <span className="material-symbols-outlined text-[27px]">
                history
              </span>
            </div>

            <h2 className="text-2xl font-bold">
              View History
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted">
              Review previous scans, confidence scores, disease results and dates.
            </p>

            <div className="mt-5 text-sm font-semibold">
              Open Prediction History →
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
