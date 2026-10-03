"use client";

/**
 * FeedbackAnalyticsPanel — admin feedback insights.
 *
 * Renders rating distribution, feedback-by-type breakdown, a submission trend
 * chart (with range presets) and model/provider counts, all driven by
 * GET /api/admin/feedback/analytics.
 */

import { useState } from "react";
import { adminFeedbackAnalytics } from "@/lib/feedbackApi";
import { useLoad } from "./ui";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

const RATING_COLOR: Record<number, string> = {
  1: "#ef4444", 2: "#f97316", 3: "#f59e0b", 4: "#84cc16", 5: "#16a34a",
};

export function FeedbackAnalyticsPanel() {
  const [days, setDays] = useState(30);
  const load = useLoad(() => adminFeedbackAnalytics({ days }), [days]);
  const a = load.data;

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-line p-1 shadow-sm w-fit">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
              days === r.days ? "bg-brand-700 text-white" : "text-muted hover:bg-surface-muted"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {load.error && (
        <div className="px-4 py-3 rounded-lg bg-danger-soft text-danger text-[13px] border border-[#fca5a5]">{load.error}</div>
      )}

      {load.loading || !a ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-56 rounded-xl bg-white border border-line animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Rating distribution */}
            <Card title="Rating distribution" icon="star">
              <div className="space-y-2.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = a.rating_distribution[n] ?? 0;
                  const pct = a.total ? Math.round((count / a.total) * 100) : 0;
                  return (
                    <div key={n} className="flex items-center gap-2">
                      <span className="w-8 text-[12px] font-semibold text-ink">{n}★</span>
                      <div className="flex-1 h-6 rounded-md bg-surface-muted overflow-hidden">
                        <div className="h-full rounded-md transition-all" style={{ width: `${pct}%`, background: RATING_COLOR[n] }} />
                      </div>
                      <span className="w-10 text-right text-[12px] tabular-nums text-muted">{count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Feedback by type */}
            <Card title="Feedback by type" icon="category">
              {a.by_type.length === 0 ? <Empty /> : (
                <div className="space-y-2.5">
                  {a.by_type.map((t, i) => {
                    const max = a.by_type[0].count || 1;
                    const pct = Math.round((t.count / max) * 100);
                    return (
                      <div key={t.name} className="flex items-center gap-2">
                        <span className="w-32 text-[12px] text-ink truncate" title={t.name}>{t.name}</span>
                        <div className="flex-1 h-6 rounded-md bg-surface-muted overflow-hidden">
                          <div className="h-full rounded-md transition-all" style={{ width: `${pct}%`, background: ["#15803d", "#16a34a", "#22c55e", "#4ade80", "#86efac"][i % 5] }} />
                        </div>
                        <span className="w-10 text-right text-[12px] tabular-nums text-muted">{t.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Trend */}
          <Card title={`Submission trend · last ${days} days`} icon="query_stats">
            {a.trend.length === 0 ? <Empty /> : <TrendChart trend={a.trend} />}
          </Card>

          {/* Provider / model counts */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Chatbot feedback by provider" icon="hub">
              <NameCountList items={a.by_provider} emptyNote="No chatbot-tagged feedback in this range." />
            </Card>
            <Card title="By model" icon="memory">
              <NameCountList items={a.by_model} emptyNote="No model-tagged feedback in this range." />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-line p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-brand-700" style={{ fontSize: 18 }}>{icon}</span>
        <h3 className="text-[13px] font-bold text-ink">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-[13px] text-muted py-6 text-center">No data in this range.</p>;
}

function NameCountList({ items, emptyNote }: { items: { name: string; count: number }[]; emptyNote: string }) {
  if (!items.length) return <p className="text-[13px] text-muted py-6 text-center">{emptyNote}</p>;
  const max = items[0].count || 1;
  return (
    <div className="space-y-2.5">
      {items.map((t) => (
        <div key={t.name} className="flex items-center gap-2">
          <span className="w-32 text-[12px] text-ink truncate" title={t.name}>{t.name}</span>
          <div className="flex-1 h-6 rounded-md bg-surface-muted overflow-hidden">
            <div className="h-full rounded-md bg-brand-900 transition-all" style={{ width: `${Math.round((t.count / max) * 100)}%` }} />
          </div>
          <span className="w-10 text-right text-[12px] tabular-nums text-muted">{t.count}</span>
        </div>
      ))}
    </div>
  );
}

/* Simple CSS bar trend chart (no chart lib dependency). */
function TrendChart({ trend }: { trend: { date: string; count: number }[] }) {
  const max = Math.max(...trend.map((t) => t.count), 1);
  const step = Math.ceil(trend.length / 12); // keep labels readable
  return (
    <div className="flex items-end gap-1 h-40">
      {trend.map((t, i) => (
        <div key={t.date} className="flex-1 flex flex-col items-center justify-end h-full group">
          <div className="w-full max-w-[26px] rounded-t-md bg-brand-600 hover:bg-brand-700 transition-colors" style={{ height: `${(t.count / max) * 100}%` }} title={`${t.date}: ${t.count}`} />
          {i % step === 0 && (
            <span className="mt-1 text-[9px] text-muted whitespace-nowrap">{t.date.slice(5)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
