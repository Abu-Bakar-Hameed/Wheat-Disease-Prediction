"use client";

/**
 * UserRetentionPage — Admin User Retention Dashboard
 *
 * Layout (top → bottom), per the visual spec:
 *  1. Page header + period selector
 *  2. Row 1 — Total Users · Active Today · Active This Week · Active This Month
 *  3. Row 2 — New Users Today/Week/Month + Retention Rate (D1/D7/D14/D30)
 *  4. Analytics row — User Retention Trend (line) · Activity Distribution
 *     (donut) · User Engagement (horizontal progress bars)
 *  5. New User Analytics — expandable KPIs + journey conversion funnel
 *  6. Bottom row — Recent User Activity (table) · Weekly Wheat Summary ·
 *     Notification Settings
 *  7. Individual User Retention — search / filter / sort / paginated table
 *  8. Individual user detail — dedicated route
 *     /admin/user-retention/users/[userId] (spec §19; modal replaced)
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchRetentionActivity,
  fetchRetentionIndividualUsers,
  fetchRetentionNewUsers,
  fetchRetentionSummary,
  fetchRetentionTrend,
  fetchRetentionUsers,
  fetchRetentionWheat,
  type RetentionActivityBreakdown,
  type RetentionActivityUser,
  type RetentionIndividualSort,
  type RetentionIndividualUsersResponse,
  type RetentionNewUsers,
  type RetentionSummary,
  type RetentionTrend,
  type RetentionWheatSummary,
} from "@/lib/api";
import { LeafThumb, Sk } from "./ui";
import {
  EmptyState,
  ErrorState,
  RetentionDot,
  RetentionStatusBadge,
  formatClockTime,
  formatISODate,
  formatNumber,
  formatRelativeDay,
} from "./retentionUi";

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { label: string; days: number }[] = [
  { label: "Last 7 Days",  days: 7 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
  { label: "This Year",    days: 365 },
];

const TABLE_ROWS = 8;

/** Fixed, user-safe error copy (consolidated spec §40) — never raw backend errors. */
const LOAD_ERROR = "Unable to load retention analytics.";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctBadge(pct: number) {
  const up   = pct >= 0;
  const cls  = up ? "text-emerald-600" : "text-red-500";
  const icon = up ? "↑" : "↓";
  return (
    <span className={`text-[11px] font-semibold ${cls}`}>
      {icon} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  changePct,
  icon,
  iconBg,
  iconColor,
  loading,
}: {
  label: string;
  value: number;
  changePct: number;
  icon: string;
  iconBg: string;
  iconColor: string;
  loading: boolean;
}) {
  return (
    <div className="flex min-h-[125px] flex-col justify-center rounded-xl border border-line bg-white p-5 shadow-sm">
      {loading ? (
        <Sk className="h-16" />
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] font-medium text-muted">{label}</p>
              <p className="mt-1 text-[28px] font-bold leading-none text-ink">
                {formatNumber(value)}
              </p>
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
              <span className={`material-symbols-outlined ${iconColor}`} style={{ fontSize: 20 }}>
                {icon}
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1">
            {pctBadge(changePct)}
            <span className="text-[11px] text-muted">vs previous period</span>
          </div>
        </>
      )}
    </div>
  );
}

function RetentionRateCard({
  rates,
  loading,
  error,
  onRetry,
}: {
  rates: RetentionTrend["rates"];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[125px] flex-col justify-center rounded-xl border border-brand-200 bg-brand-50 p-5 shadow-sm">
      <p className="text-[13px] font-semibold text-brand-700">Overall Retention</p>
      {loading ? (
        <Sk className="mt-2 h-10" />
      ) : error ? (
        <button
          onClick={onRetry}
          className="mt-2 text-left text-[12px] text-danger hover:underline"
        >
          {error} — click to retry
        </button>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-1 text-center">
          {rates.map((r) => (
            <div
              key={r.label}
              title={r.cohort_size > 0 ? `Cohort: ${r.cohort_size} users` : "Cohort not yet observable"}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {r.label}
              </p>
              <p className="text-[15px] font-bold leading-tight text-brand-700 lg:text-[17px]">
                {r.cohort_size === 0 ? "—" : `${Math.round(r.rate)}%`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashCard({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col rounded-xl border border-line bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Custom point for the retention line — draws the dot + its % value above it. */
function RateDot({ cx, cy, value }: { cx?: number; cy?: number; value?: number | string }) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="#16a34a" />
      <text
        x={cx}
        y={cy - 12}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="#374151"
      >
        {`${Math.round(Number(value ?? 0))}%`}
      </text>
    </g>
  );
}

// ── New User Analytics card (spec §12 / §13) ─────────────────────────────────

function NewUserAnalyticsCard({
  data,
  loading,
  error,
  onRetry,
  expanded,
  onToggle,
}: {
  data: RetentionNewUsers | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const funnel = data?.funnel ?? [];

  return (
    <div className="rounded-xl border border-line bg-white shadow-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold text-ink">🆕 New User Analytics</h3>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            {loading ? "…" : `${formatNumber(data?.new_in_period ?? 0)} new in period`}
          </span>
        </div>
        <span className="material-symbols-outlined text-muted" style={{ fontSize: 20 }}>
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-surface-muted px-5 py-4">
          {loading ? (
            <Sk className="h-[220px]" />
          ) : error ? (
            <ErrorState message={error} onRetry={onRetry} />
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[46fr_54fr]">
              {/* KPI half */}
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "New Today",  value: data?.new_today ?? 0,     icon: "person_add" },
                    { label: "This Week",  value: data?.new_this_week ?? 0, icon: "group_add" },
                    { label: "This Month", value: data?.new_this_month ?? 0, icon: "groups" },
                    { label: "In Period",  value: data?.new_in_period ?? 0, icon: "date_range" },
                  ].map((k) => (
                    <div key={k.label} className="rounded-lg border border-surface-muted bg-surface-muted px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-brand-600" style={{ fontSize: 15 }}>{k.icon}</span>
                        <p className="text-[11px] text-muted">{k.label}</p>
                      </div>
                      <p className="mt-1 text-[18px] font-bold leading-none text-ink">{formatNumber(k.value)}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "New Users Who Logged In",         value: data?.logged_in_again ?? 0, icon: "login" },
                    { label: "New Users Who Made a Prediction", value: data?.made_prediction ?? 0, icon: "science" },
                    { label: "New Users Who Opened Calendar",   value: data?.opened_calendar ?? 0, icon: "calendar_month" },
                    { label: "New Users Who Returned",          value: data?.returned ?? 0,        icon: "replay" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between border-b border-surface-muted py-1.5 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-brand-600" style={{ fontSize: 16 }}>{row.icon}</span>
                        <span className="text-[13px] text-muted">{row.label}</span>
                      </div>
                      <span className="text-[13px] font-semibold text-ink">{formatNumber(row.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Funnel half */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Journey Conversion Funnel — users registered in the selected period
                </p>
                {(data?.new_in_period ?? 0) === 0 || funnel.length === 0 ? (
                  <EmptyState icon="filter_alt" message="No new users registered in this period yet." />
                ) : (
                  <div className="space-y-3">
                    {funnel.map((s, i) => {
                      const width = Math.max(s.pct_of_registered, s.count > 0 ? 2 : 0);
                      return (
                        <div key={s.key}>
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="font-medium text-ink">{s.label}</span>
                            <span className="text-muted">
                              <span className="font-semibold text-ink">{formatNumber(s.count)}</span>
                              {i > 0 && <span className="ml-2">{s.pct_of_previous}%</span>}
                            </span>
                          </div>
                          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <p className="pt-1 text-[11px] text-muted">
                      Percentages show conversion from the previous stage; bar width is relative to the registration base.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UserRetentionPage() {
  const router = useRouter();

  const [days, setDays] = useState(30);
  const [periodOpen, setPeriodOpen] = useState(false);

  const [summary,  setSummary]  = useState<RetentionSummary | null>(null);
  const [trend,    setTrend]    = useState<RetentionTrend | null>(null);
  const [users,    setUsers]    = useState<RetentionActivityUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [wheat,    setWheat]    = useState<RetentionWheatSummary | null>(null);
  const [activity, setActivity] = useState<RetentionActivityBreakdown | null>(null);

  // New-user analytics (expandable card)
  const [newUsers,        setNewUsers]        = useState<RetentionNewUsers | null>(null);
  const [loadingNewUsers, setLoadingNewUsers] = useState(true);
  const [errorNewUsers,   setErrorNewUsers]   = useState<string | null>(null);
  const [newUsersOpen,    setNewUsersOpen]    = useState(true);

  // Individual user retention table
  const [indSearchInput, setIndSearchInput] = useState("");
  const [indSearch,      setIndSearch]      = useState("");
  const [indStatus,      setIndStatus]      = useState("all");
  const [indEngagement,  setIndEngagement]  = useState("all");
  const [indSort,        setIndSort]        = useState<RetentionIndividualSort>("last_active");
  const [indPage,        setIndPage]        = useState(1);
  const [indData,        setIndData]        = useState<RetentionIndividualUsersResponse | null>(null);
  const [loadingInd,     setLoadingInd]     = useState(true);
  const [errorInd,       setErrorInd]       = useState<string | null>(null);

  const [loadingSummary,  setLoadingSummary]  = useState(true);
  const [loadingTrend,    setLoadingTrend]    = useState(true);
  const [loadingUsers,    setLoadingUsers]    = useState(true);
  const [loadingWheat,    setLoadingWheat]    = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const [errorSummary,  setErrorSummary]  = useState<string | null>(null);
  const [errorTrend,    setErrorTrend]    = useState<string | null>(null);
  const [errorUsers,    setErrorUsers]    = useState<string | null>(null);
  const [errorWheat,    setErrorWheat]    = useState<string | null>(null);
  const [errorActivity, setErrorActivity] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    setErrorSummary(null);
    try {
      setSummary(await fetchRetentionSummary(days));
    } catch (e) {
      // Never surface raw backend errors (spec §40) — log for debugging only.
      console.error("Retention summary load failed:", e);
      setErrorSummary(LOAD_ERROR);
    }
    finally { setLoadingSummary(false); }
  }, [days]);

  const loadTrend = useCallback(async () => {
    setLoadingTrend(true);
    setErrorTrend(null);
    try {
      setTrend(await fetchRetentionTrend());
    } catch (e) {
      // Never surface raw backend errors (spec §40) — log for debugging only.
      console.error("Retention trend load failed:", e);
      setErrorTrend(LOAD_ERROR);
    }
    finally { setLoadingTrend(false); }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setErrorUsers(null);
    try {
      const res = await fetchRetentionUsers(days, 1, TABLE_ROWS);
      setUsers(res.users);
      setUserTotal(res.total);
    } catch (e) {
      // Never surface raw backend errors (spec §40) — log for debugging only.
      console.error("Retention users load failed:", e);
      setErrorUsers(LOAD_ERROR);
    }
    finally { setLoadingUsers(false); }
  }, [days]);

  const loadWheat = useCallback(async () => {
    setLoadingWheat(true);
    setErrorWheat(null);
    try {
      setWheat(await fetchRetentionWheat(days));
    } catch (e) {
      // Never surface raw backend errors (spec §40) — log for debugging only.
      console.error("Retention wheat load failed:", e);
      setErrorWheat(LOAD_ERROR);
    }
    finally { setLoadingWheat(false); }
  }, [days]);

  const loadActivity = useCallback(async () => {
    setLoadingActivity(true);
    setErrorActivity(null);
    try {
      setActivity(await fetchRetentionActivity(days));
    } catch (e) {
      // Never surface raw backend errors (spec §40) — log for debugging only.
      console.error("Retention activity load failed:", e);
      setErrorActivity(LOAD_ERROR);
    }
    finally { setLoadingActivity(false); }
  }, [days]);

  const loadNewUsers = useCallback(async () => {
    setLoadingNewUsers(true);
    setErrorNewUsers(null);
    try {
      setNewUsers(await fetchRetentionNewUsers(days));
    } catch (e) {
      // Never surface raw backend errors (spec §40) — log for debugging only.
      console.error("Retention new-users load failed:", e);
      setErrorNewUsers(LOAD_ERROR);
    }
    finally { setLoadingNewUsers(false); }
  }, [days]);

  const loadIndividual = useCallback(async () => {
    setLoadingInd(true);
    setErrorInd(null);
    try {
      const res = await fetchRetentionIndividualUsers({
        days,
        page: indPage,
        pageSize: 10,
        search: indSearch,
        status: indStatus,
        hasPredictions:
          indEngagement === "has_predictions" ? true
          : indEngagement === "no_predictions" ? false
          : undefined,
        sort: indSort,
      });
      setIndData(res);
      const maxPage = Math.max(1, Math.ceil(res.total / res.page_size));
      if (res.page > maxPage) setIndPage(maxPage);
    } catch (e) {
      // Never surface raw backend errors (spec §40) — log for debugging only.
      console.error("Individual users load failed:", e);
      setErrorInd(LOAD_ERROR);
    }
    finally { setLoadingInd(false); }
  }, [days, indPage, indSearch, indStatus, indEngagement, indSort]);

  const loadAnalytics = useCallback(() => {
    void loadSummary();
    void loadActivity();
  }, [loadSummary, loadActivity]);

  const loadAll = useCallback(() => {
    loadAnalytics();
    void loadTrend();
    void loadUsers();
    void loadWheat();
    void loadNewUsers();
  }, [loadAnalytics, loadTrend, loadUsers, loadWheat, loadNewUsers]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data loaders set their own loading flags
  useEffect(() => { loadAll(); }, [loadAll]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loader sets its own loading flags
  useEffect(() => { void loadIndividual(); }, [loadIndividual]);

  // Debounced search box → committed query + reset to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setIndSearch(indSearchInput);
      setIndPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [indSearchInput]);

  // Close period dropdown on outside click
  useEffect(() => {
    if (!periodOpen) return;
    const h = () => setPeriodOpen(false);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [periodOpen]);

  const currentPeriod = PERIOD_OPTIONS.find(o => o.days === days) ?? PERIOD_OPTIONS[1];

  // Trend chart data
  const trendRates = trend?.rates ?? [];
  const hasTrendData = trendRates.some(r => r.cohort_size > 0);
  const trendChartData = trendRates.map(r => ({
    name: r.label,
    rate: r.rate,
    size: r.cohort_size,
  }));

  // Activity distribution (donut) — Predictions · Calendar Views · Logins ·
  // Notifications · Other (history + assistant + misc events)
  const donutItems = [
    { name: "Predictions",    value: activity?.predictions ?? 0,    color: "#16a34a" },
    { name: "Calendar Views", value: activity?.calendar_views ?? 0, color: "#3b82f6" },
    { name: "Logins",         value: activity?.logins ?? 0,         color: "#8b5cf6" },
    { name: "Notifications",  value: activity?.notifications ?? 0,  color: "#f59e0b" },
    {
      name: "Other",
      value: (activity?.history_views ?? 0) + (activity?.assistant_uses ?? 0) + (activity?.other_events ?? 0),
      color: "#94a3b8",
    },
  ].filter(d => d.value > 0);

  // Engagement breakdown (progress bars) — Other bundles logins + misc events
  const engagementRows = [
    { name: "Make Prediction", value: activity?.predictions ?? 0,    color: "#16a34a" },
    { name: "View Calendar",   value: activity?.calendar_views ?? 0, color: "#3b82f6" },
    { name: "View History",    value: activity?.history_views ?? 0,  color: "#14b8a6" },
    { name: "Notifications",   value: activity?.notifications ?? 0,  color: "#f59e0b" },
    {
      name: "Other",
      value: (activity?.logins ?? 0) + (activity?.assistant_uses ?? 0) + (activity?.other_events ?? 0),
      color: "#94a3b8",
    },
  ];
  const engagementTotal = engagementRows.reduce((sum, r) => sum + r.value, 0);

  // Individual table pagination
  const indTotalPages = indData ? Math.max(1, Math.ceil(indData.total / indData.page_size)) : 1;
  const indStartRow = indData && indData.total > 0 ? (indPage - 1) * indData.page_size + 1 : 0;
  const indEndRow   = indData ? Math.min(indPage * indData.page_size, indData.total) : 0;

  // Numbered pagination window (spec §18): at most 5 page buttons around the
  // current page, e.g. «1 2 3 4 5 Next →». Data stays backend-paginated.
  const indPageNumbers = (() => {
    const total = indTotalPages;
    const maxButtons = 5;
    let start = Math.max(1, indPage - Math.floor(maxButtons / 2));
    const end = Math.min(total, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const nums: number[] = [];
    for (let p = start; p <= end; p += 1) nums.push(p);
    return nums;
  })();

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-bold text-ink">
            <span className="material-symbols-outlined text-brand-700" style={{ fontSize: 26 }}>
              person_pin_circle
            </span>
            User Retention
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            Track user activity, engagement, retention and prediction usage
          </p>
        </div>

        {/* Period selector */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setPeriodOpen(v => !v)}
            className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-ink shadow-sm transition-colors hover:bg-surface-muted"
          >
            <span className="material-symbols-outlined text-muted" style={{ fontSize: 17 }}>
              date_range
            </span>
            {currentPeriod.label}
            <span className="material-symbols-outlined text-muted" style={{ fontSize: 17 }}>
              expand_more
            </span>
          </button>
          {periodOpen && (
            <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  onClick={() => { setDays(opt.days); setPeriodOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-brand-50 ${
                    opt.days === days ? "bg-brand-50 font-semibold text-brand-700" : "text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 1: audience summary ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Users"        value={summary?.total_users         ?? 0} changePct={summary?.total_change_pct         ?? 0} icon="group"         iconBg="bg-[#ede9fe]" iconColor="text-[#7c3aed]" loading={loadingSummary} />
        <KpiCard label="Active Today"       value={summary?.active_today        ?? 0} changePct={summary?.active_today_change_pct  ?? 0} icon="today"          iconBg="bg-brand-100" iconColor="text-brand-700" loading={loadingSummary} />
        <KpiCard label="Active This Week"   value={summary?.active_this_week    ?? 0} changePct={summary?.active_week_change_pct   ?? 0} icon="calendar_today" iconBg="bg-info-soft" iconColor="text-info" loading={loadingSummary} />
        <KpiCard label="Active This Month"  value={summary?.active_this_month   ?? 0} changePct={summary?.active_month_change_pct  ?? 0} icon="calendar_month" iconBg="bg-warning-soft" iconColor="text-warning" loading={loadingSummary} />
      </div>

      {/* ── Row 2: growth + retention rates ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="New Users Today"      value={summary?.new_today      ?? 0} changePct={summary?.new_today_change_pct  ?? 0} icon="person_add" iconBg="bg-brand-50" iconColor="text-brand-600" loading={loadingSummary} />
        <KpiCard label="New Users This Week"  value={summary?.new_this_week  ?? 0} changePct={summary?.new_week_change_pct   ?? 0} icon="group_add"  iconBg="bg-brand-50" iconColor="text-brand-600" loading={loadingSummary} />
        <KpiCard label="New Users This Month" value={summary?.new_this_month ?? 0} changePct={summary?.new_month_change_pct  ?? 0} icon="groups"     iconBg="bg-brand-50" iconColor="text-brand-600" loading={loadingSummary} />
        <RetentionRateCard
          rates={trendRates}
          loading={loadingTrend}
          error={errorTrend}
          onRetry={loadTrend}
        />
      </div>

      {/* ── Analytics row: trend · distribution · engagement ────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[42fr_32fr_26fr]">

        {/* User Retention Trend */}
        <DashCard title="User Retention Trend" className="md:col-span-2 xl:col-span-1">
          {loadingTrend ? (
            <Sk className="h-[240px]" />
          ) : errorTrend ? (
            <ErrorState message={errorTrend} onRetry={loadTrend} />
          ) : !hasTrendData ? (
            <EmptyState icon="show_chart" message="Not enough data yet. Retention metrics will appear as more users return to the application." />
          ) : (
            <div className="h-[240px] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendChartData} margin={{ top: 20, right: 14, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="retentionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(value) => [`${value}%`, "Retention"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="#16a34a"
                    strokeWidth={2.5}
                    fill="url(#retentionGrad)"
                    dot={<RateDot />}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </DashCard>

        {/* User Activity Distribution */}
        <DashCard title="User Activity Distribution">
          {loadingActivity || loadingSummary ? (
            <Sk className="h-[240px]" />
          ) : (errorActivity ?? errorSummary) ? (
            <ErrorState message={(errorActivity ?? errorSummary) ?? ""} onRetry={loadAnalytics} />
          ) : donutItems.length === 0 ? (
            <EmptyState icon="donut_small" message="No activity recorded in this period yet." />
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="relative h-[200px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutItems}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={84}
                      paddingAngle={3}
                    >
                      {donutItems.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[22px] font-bold leading-none text-ink">
                    {formatNumber(summary?.total_users ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">Total Users</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {donutItems.map((d) => (
                  <span key={d.name} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                    <span className="font-semibold text-ink">{formatNumber(d.value)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </DashCard>

        {/* User Engagement */}
        <DashCard title="User Engagement">
          {loadingActivity ? (
            <Sk className="h-[240px]" />
          ) : errorActivity ? (
            <ErrorState message={errorActivity} onRetry={loadActivity} />
          ) : engagementTotal === 0 ? (
            <EmptyState icon="insights" message="No engagement recorded in this period yet." />
          ) : (
            <div className="flex flex-1 flex-col justify-center gap-5">
              {engagementRows.map((row) => {
                const pct = Math.round((row.value / engagementTotal) * 100);
                return (
                  <div
                    key={row.name}
                    className="flex items-center gap-3"
                    title={`${formatNumber(row.value)} events`}
                  >
                    <span className="w-[104px] shrink-0 text-[12px] text-muted">{row.name}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: row.color }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-[12px] font-semibold text-ink">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </DashCard>
      </div>

      {/* ── New User Analytics — KPIs + journey funnel ───────────────────── */}
      <NewUserAnalyticsCard
        data={newUsers}
        loading={loadingNewUsers}
        error={errorNewUsers}
        onRetry={loadNewUsers}
        expanded={newUsersOpen}
        onToggle={() => setNewUsersOpen((v) => !v)}
      />

      {/* ── Bottom row: activity · wheat summary · notifications ─────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[52fr_27fr_21fr]">

        {/* Recent User Activity table */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm md:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Recent User Activity</h3>
              <p className="mt-0.5 text-[12px] text-muted">
                {userTotal > 0 ? `${formatNumber(userTotal)} total users` : "User engagement data"}
              </p>
            </div>
            <button
              onClick={() => router.push("/admin/users")}
              className="flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline"
            >
              View All
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>chevron_right</span>
            </button>
          </div>

          {loadingUsers ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3, 4].map(i => <Sk key={i} className="h-12" />)}
            </div>
          ) : errorUsers ? (
            <div className="p-5"><ErrorState message={errorUsers} onRetry={loadUsers} /></div>
          ) : users.length === 0 ? (
            <div className="p-5"><EmptyState message="No user data available." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-surface-muted text-[10px] uppercase text-muted">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2.5 font-semibold tracking-wide">User</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold tracking-wide">Registration Date</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold tracking-wide">Last Active</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tracking-wide">Predictions</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tracking-wide">Logins</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tracking-wide">Notifications</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-semibold tracking-wide">Status</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-semibold tracking-wide">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-muted">
                  {users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt={u.name} className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-brand-100" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-[11px] font-bold text-white">
                              {(u.name || "U").slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{u.name}</p>
                            <p className="truncate text-[11px] text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatISODate(u.registered)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{u.last_active ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-ink">{u.predictions}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{u.logins ?? 0}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{u.notifications ?? 0}</td>
                      <td className="px-4 py-2.5"><RetentionStatusBadge value={u.status} /></td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => router.push(`/admin/user-retention/users/${u.id}`)}
                          aria-label={`View ${u.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-brand-700 transition-colors hover:bg-brand-50"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>chevron_right</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Weekly Wheat Summary */}
        <DashCard
          title="🌾 Weekly Wheat Summary"
          action={
            <button
              onClick={() => router.push("/admin/diagnosis")}
              className="flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:underline"
            >
              View Details
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
            </button>
          }
        >
          {loadingWheat ? (
            <Sk className="h-[280px]" />
          ) : errorWheat ? (
            <ErrorState message={errorWheat} onRetry={loadWheat} />
          ) : !wheat || (wheat.total_predictions === 0 && wheat.reminders === 0) ? (
            <EmptyState icon="agriculture" message="No wheat activity in this period." />
          ) : (
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted">Predictions</span>
                <span className="text-[14px] font-bold text-ink">{wheat.total_predictions}</span>
              </div>

              <div className="space-y-1.5">
                {[
                  { label: "Low / Healthy",  value: wheat.severity.low_healthy,  dot: "bg-emerald-500" },
                  { label: "Medium",          value: wheat.severity.medium,        dot: "bg-amber-500" },
                  { label: "High / Critical", value: wheat.severity.high_critical, dot: "bg-red-500" },
                  { label: "Reminders",       value: wheat.reminders ?? 0,         dot: "bg-violet-600" },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between border-b border-surface-muted py-1.5 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} />
                      <span className="text-[13px] text-muted">{row.label}</span>
                    </div>
                    <span className="text-[13px] font-semibold text-ink">{row.value}</span>
                  </div>
                ))}
              </div>

              {wheat.latest && (
                <div className="mt-auto border-t border-surface-muted pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Latest Prediction
                  </p>
                  <div className="flex items-center gap-3">
                    <LeafThumb src={wheat.latest.image_url} alt={wheat.latest.disease} className="h-12 w-12" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">{wheat.latest.disease}</p>
                      <p className="text-[12px] font-semibold text-brand-600">
                        {wheat.latest.confidence_pct.toFixed(1)}%
                      </p>
                      {wheat.latest.created_at_iso ? (
                        <>
                          <p className="text-[11px] leading-tight text-muted">
                            {formatRelativeDay(wheat.latest.created_at_iso)}
                          </p>
                          <p className="text-[11px] leading-tight text-muted">
                            {formatClockTime(wheat.latest.created_at_iso)}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] leading-tight text-muted">{wheat.latest.created_at}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DashCard>

        {/* Notification activity (spec §42) — display only; configuration
            stays in the existing settings system (/admin/settings). */}
        <DashCard title="🔔 Notification Activity">
          <div className="flex flex-1 flex-col gap-3">
            {loadingActivity ? (
              <Sk className="h-16" />
            ) : errorActivity ? (
              <ErrorState message={errorActivity} onRetry={loadActivity} />
            ) : (
              <>
                <div className="rounded-lg border border-surface-muted bg-surface-muted px-3 py-2.5">
                  <p className="text-[11px] text-muted">Notifications in period</p>
                  <p className="mt-0.5 text-[18px] font-bold leading-none text-ink">
                    {formatNumber(activity?.notifications ?? 0)}
                  </p>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-info-soft bg-info-soft px-3 py-2.5">
                  <span className="material-symbols-outlined text-[#0284c7]" style={{ fontSize: 15 }}>info</span>
                  <p className="text-[11px] leading-snug text-[#0369a1]">
                    Notification preferences are configured in the existing settings system.
                  </p>
                </div>

                <button
                  onClick={() => router.push("/admin/settings")}
                  className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                >
                  Manage in System Settings
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                </button>
              </>
            )}
          </div>
        </DashCard>
      </div>

      {/* ── Individual User Retention — search / filter / sort / pagination ─ */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">👥 Individual User Retention</h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Search, filter and open any user&apos;s full retention profile
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" style={{ fontSize: 16 }}>search</span>
              <input
                value={indSearchInput}
                onChange={(e) => setIndSearchInput(e.target.value)}
                placeholder="Search users..."
                className="h-9 w-[210px] rounded-lg border border-line bg-white pl-8 pr-3 text-[13px] text-ink outline-none transition-colors focus:border-brand-600"
              />
            </div>
            <select
              value={indStatus}
              onChange={(e) => { setIndStatus(e.target.value); setIndPage(1); }}
              className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand-600"
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="active">Active</option>
              <option value="returning">Returning</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={indEngagement}
              onChange={(e) => { setIndEngagement(e.target.value); setIndPage(1); }}
              className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand-600"
            >
              <option value="all">All Engagement</option>
              <option value="has_predictions">Has Predictions</option>
              <option value="no_predictions">No Predictions</option>
            </select>
            <select
              value={indSort}
              onChange={(e) => { setIndSort(e.target.value as RetentionIndividualSort); setIndPage(1); }}
              className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand-600"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="last_active">Last Active</option>
              <option value="most_predictions">Most Predictions</option>
              <option value="most_logins">Most Logins</option>
            </select>
          </div>
        </div>

        {loadingInd ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4, 5].map((i) => <Sk key={i} className="h-11" />)}
          </div>
        ) : errorInd ? (
          <div className="p-5"><ErrorState message={errorInd} onRetry={loadIndividual} /></div>
        ) : !indData || indData.users.length === 0 ? (
          <div className="p-5">
            <EmptyState message="No users match the current search or filters." icon="search_off" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-surface-muted text-[10px] uppercase text-muted">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2.5 font-semibold tracking-wide">User</th>
                    {["Registration Date", "Last Login", "Last Logout", "Last Active"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold tracking-wide">{h}</th>
                    ))}
                    {["Sessions", "Logins", "Predictions", "Calendar Visits", "Notifications"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tracking-wide">{h}</th>
                    ))}
                    {["D1", "D7", "D14", "D30"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2.5 text-center font-semibold tracking-wide">{h}</th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold tracking-wide">Status</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-semibold tracking-wide">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-muted">
                  {indData.users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt={u.name} className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-brand-100" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-[11px] font-bold text-white">
                              {(u.name || "U").slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{u.name}</p>
                            <p className="truncate text-[11px] text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{u.registered}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{u.last_login ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{u.last_logout ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{u.last_active ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-ink">{u.total_sessions}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{u.logins}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{u.predictions}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{u.calendar_views}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{u.notifications}</td>
                      <td className="px-2 py-2.5 text-center"><RetentionDot label="D1"  retained={u.retained_d1}  observable={u.d1_observable} /></td>
                      <td className="px-2 py-2.5 text-center"><RetentionDot label="D7"  retained={u.retained_d7}  observable={u.d7_observable} /></td>
                      <td className="px-2 py-2.5 text-center"><RetentionDot label="D14" retained={u.retained_d14} observable={u.d14_observable} /></td>
                      <td className="px-2 py-2.5 text-center"><RetentionDot label="D30" retained={u.retained_d30} observable={u.d30_observable} /></td>
                      <td className="px-3 py-2.5"><RetentionStatusBadge value={u.status} /></td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => router.push(`/admin/user-retention/users/${u.id}`)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                        >
                          View
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-muted">
                Showing {formatNumber(indStartRow)}–{formatNumber(indEndRow)} of {formatNumber(indData.total)} users
              </p>
              {/* Numbered pagination (spec §18) — backend-paginated; 5 page buttons max */}
              <div className="flex flex-wrap items-center gap-1.5">
                {indPageNumbers.map((p) => (
                  <button
                    key={p}
                    onClick={() => setIndPage(p)}
                    aria-current={p === indPage ? "page" : undefined}
                    className={`h-8 min-w-[32px] rounded-lg border px-2 text-[12px] font-semibold transition-colors ${
                      p === indPage
                        ? "border-brand-700 bg-brand-700 text-white"
                        : "border-line text-ink hover:bg-surface-muted"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  disabled={indPage >= indTotalPages}
                  onClick={() => setIndPage((p) => p + 1)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[12px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
