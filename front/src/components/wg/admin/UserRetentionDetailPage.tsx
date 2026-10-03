"use client";

/**
 * UserRetentionDetailPage — /admin/user-retention/users/[userId]
 *
 * The single place for detailed individual-user analytics (consolidated
 * spec §19–§27):
 *   • §20 header  — name, email, registration date, last active, status
 *   • §21 summary — Total Logins · Total Sessions · Total Predictions ·
 *                   Calendar Visits · Notifications · Days Active + D1–D30
 *   • §22 login/logout history — First/Last Login, Total Logins,
 *                   Last Logout, Total Explicit Logouts
 *   • §24 prediction analytics — totals + first/last prediction
 *   • §25 prediction history   — date, time, disease, confidence, severity,
 *                   reminder, View (reuses /admin/predictions/{id})
 *   • §27 activity timeline    — newest first, real events only
 *
 * Never exposes passwords, tokens or secrets — only the fields returned by
 * the admin-only retention detail endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchRetentionUserDetail, type RetentionUserDetail } from "@/lib/api";
import { Sk } from "./ui";
import {
  EmptyState,
  ErrorState,
  RetentionDot,
  RetentionStatusBadge,
  TIMELINE_ICONS,
  formatNumber,
  severityPill,
} from "./retentionUi";

const LOAD_ERROR = "Unable to load user activity.";
const PRED_STEP = 15;
const TIMELINE_STEP = 30;

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-muted py-2 last:border-0">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span
        className="max-w-[62%] truncate text-right text-[12.5px] font-semibold text-ink"
        title={String(value)}
      >
        {value}
      </span>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-line bg-white p-5 shadow-sm ${className}`}>
      <h3 className="mb-3 text-[14px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function UserRetentionDetailPage({ userId }: { userId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<RetentionUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [predLimit, setPredLimit] = useState(PRED_STEP);
  const [timelineLimit, setTimelineLimit] = useState(TIMELINE_STEP);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchRetentionUserDetail(userId));
    } catch (e) {
      // Never surface raw backend errors (spec §40) — log for debugging only.
      console.error("Unable to load user activity:", e);
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loader sets its own loading flags
  useEffect(() => { void load(); }, [load]);

  const timelineNewestFirst = detail ? [...detail.timeline].reverse() : [];

  return (
    <div className="space-y-5">

      {/* ── Back + title ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/user-retention"
            aria-label="Back to User Retention"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink shadow-sm transition-colors hover:bg-surface-muted"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          </Link>
          <div>
            <h1 className="text-[20px] font-bold text-ink">User Retention Profile</h1>
            <p className="text-[12px] text-muted">
              Complete activity history and prediction record for this user
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-5">
          <Sk className="h-[120px]" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <Sk key={i} className="h-[92px]" />)}
          </div>
          <Sk className="h-[220px]" />
          <Sk className="h-[220px]" />
        </div>
      ) : error || !detail ? (
        <div className="rounded-xl border border-line bg-white shadow-sm">
          <ErrorState message={error ?? LOAD_ERROR} onRetry={load} />
        </div>
      ) : (
        <>
          {/* ── §20 Header ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 shadow-sm sm:flex-row sm:items-center">
            {detail.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={detail.avatar_url}
                alt={detail.name}
                className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-brand-100"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-900 text-[18px] font-bold text-white">
                {(detail.name || "U").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[18px] font-bold text-ink">{detail.name}</h2>
                <RetentionStatusBadge value={detail.status} />
                {detail.email_verified && (
                  <span title="Email verified" className="material-symbols-outlined text-brand-600" style={{ fontSize: 16 }}>
                    verified
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[13px] text-muted">{detail.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-muted" style={{ fontSize: 15 }}>event</span>
                  Registered <span className="font-semibold text-ink">{detail.registered}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-muted" style={{ fontSize: 15 }}>schedule</span>
                  Last active <span className="font-semibold text-ink">{detail.last_active ?? "—"}</span>
                  {detail.days_since_last_active != null && (
                    <span className="text-muted">({detail.days_since_last_active} day(s) ago)</span>
                  )}
                </span>
                {detail.organization && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-muted" style={{ fontSize: 15 }}>apartment</span>
                    {detail.organization}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── §21 Summary cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Total Logins",       value: detail.logins,           icon: "login" },
              { label: "Total Sessions",     value: detail.sessions,         icon: "devices" },
              { label: "Total Predictions",  value: detail.total_predictions, icon: "science" },
              { label: "Calendar Visits",    value: detail.calendar_views,   icon: "calendar_month" },
              { label: "Notifications",      value: detail.notifications,    icon: "notifications" },
              { label: "Days Active",        value: detail.days_active,      icon: "event_available" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-line bg-white px-4 py-3.5 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-brand-600" style={{ fontSize: 16 }}>{c.icon}</span>
                  <p className="text-[11px] text-muted">{c.label}</p>
                </div>
                <p className="mt-1.5 text-[22px] font-bold leading-none text-ink">
                  {formatNumber(c.value)}
                </p>
              </div>
            ))}
          </div>

          {/* ── §21 retention + §22 login/logout + §24 prediction stats ────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard title="Retention">
              <div className="flex flex-wrap items-center gap-2">
                <RetentionDot label="D1"  retained={detail.retained_d1}  observable={detail.d1_observable} />
                <RetentionDot label="D7"  retained={detail.retained_d7}  observable={detail.d7_observable} />
                <RetentionDot label="D14" retained={detail.retained_d14} observable={detail.d14_observable} />
                <RetentionDot label="D30" retained={detail.retained_d30} observable={detail.d30_observable} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                ✓ retained · ✕ not retained · dashed = not yet reached. Retention is
                measured from the registration date using meaningful activity only.
              </p>
            </SectionCard>

            <SectionCard title="Login & Logout History">
              <StatRow label="First Login" value={detail.first_login_at ?? "—"} />
              <StatRow label="Last Login" value={detail.last_login_at ?? "—"} />
              <StatRow label="Total Logins" value={formatNumber(detail.logins)} />
              <StatRow label="Last Logout" value={detail.last_logout_at ?? "—"} />
              <StatRow label="Total Explicit Logouts" value={formatNumber(detail.sign_outs)} />
            </SectionCard>

            <SectionCard title="Prediction Analytics">
              <StatRow label="Total Predictions" value={formatNumber(detail.total_predictions)} />
              <StatRow label="Predictions This Week" value={formatNumber(detail.predictions_this_week)} />
              <StatRow label="Predictions This Month" value={formatNumber(detail.predictions_this_month)} />
              <StatRow label="First Prediction" value={detail.first_prediction_at ?? "—"} />
              <StatRow label="Last Prediction" value={detail.last_prediction_at ?? "—"} />
            </SectionCard>
          </div>

          {/* ── §25 Prediction history ─────────────────────────────────────── */}
          <SectionCard title={`Prediction History (${formatNumber(detail.total_predictions)})`}>
            {detail.predictions.length === 0 ? (
              detail.status === "new" ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-info-soft bg-info-soft py-8 text-center">
                  <span className="material-symbols-outlined text-[#0284c7]" style={{ fontSize: 34 }}>new_releases</span>
                  <p className="text-[14px] font-semibold text-[#0c4a6e]">🆕 New User</p>
                  <p className="text-[12.5px] text-[#0369a1]">
                    No predictions yet. Newly registered users appear here even before their first prediction.
                  </p>
                </div>
              ) : (
                <EmptyState icon="science" message="This user has not made any predictions yet." />
              )
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-surface-muted">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-surface-muted text-[10px] uppercase text-muted">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold tracking-wide">Prediction Date</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold tracking-wide">Time</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold tracking-wide">Disease</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tracking-wide">Confidence</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold tracking-wide">Severity</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-center font-semibold tracking-wide">Reminder</th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-semibold tracking-wide">View</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-muted">
                      {detail.predictions.slice(0, predLimit).map((p) => (
                        <tr key={p.id} className="transition-colors hover:bg-surface-muted">
                          <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{p.created_date}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted">{p.created_time}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">{p.disease}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-brand-600">
                            {p.confidence_pct.toFixed(1)}%
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityPill(p.severity)}`}>
                              {p.severity || "unknown"}
                            </span>
                          </td>
                          <td
                            className="whitespace-nowrap px-3 py-2.5 text-center text-muted"
                            title="Reminders are created from the Calendar; no reminder is linked to this prediction"
                          >
                            —
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <button
                              onClick={() => router.push(`/admin/predictions/${p.id}`)}
                              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
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
                {detail.predictions.length > predLimit && (
                  <button
                    onClick={() => setPredLimit((n) => n + PRED_STEP)}
                    className="mt-3 self-center rounded-lg border border-line px-4 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-surface-muted"
                  >
                    Show more ({formatNumber(detail.predictions.length - predLimit)} remaining)
                  </button>
                )}
              </>
            )}
          </SectionCard>

          {/* ── §27 Activity timeline (newest first) ───────────────────────── */}
          <SectionCard title="Activity Timeline — newest first">
            {timelineNewestFirst.length === 0 ? (
              <EmptyState icon="timeline" message="No activity recorded for this user yet." />
            ) : (
              <>
                <div className="rounded-lg border border-surface-muted">
                  {timelineNewestFirst.slice(0, timelineLimit).map((ev, i) => (
                    <div
                      key={`${ev.timestamp}-${i}`}
                      className="flex items-start gap-3 border-b border-surface-muted px-3 py-2.5 last:border-0"
                    >
                      <span className="material-symbols-outlined mt-0.5 shrink-0 text-brand-600" style={{ fontSize: 17 }}>
                        {TIMELINE_ICONS[ev.event_type] ?? "bolt"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-ink">{ev.label}</p>
                        <p className="text-[11px] text-muted">{ev.display_time}</p>
                      </div>
                      {ev.prediction_id && (
                        <button
                          onClick={() => router.push(`/admin/predictions/${ev.prediction_id}`)}
                          className="shrink-0 text-[11px] font-semibold text-brand-700 hover:underline"
                        >
                          View
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {timelineNewestFirst.length > timelineLimit && (
                  <button
                    onClick={() => setTimelineLimit((n) => n + TIMELINE_STEP)}
                    className="mt-3 self-center rounded-lg border border-line px-4 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-surface-muted"
                  >
                    Show more ({formatNumber(timelineNewestFirst.length - timelineLimit)} remaining)
                  </button>
                )}
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
