"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAdminPrediction, fetchAdminDashboard, type AdminDashboard } from "@/lib/api";
import { ConfirmModal, LeafThumb, ResultBadge, Sk, IconBtn, useLoad } from "./ui";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["#16a34a", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#14b8a6", "#f97316"];

const STAT_CONFIGS: Array<{
  label: string;
  key: keyof AdminDashboard;
  fallback?: keyof AdminDashboard;
  icon: string;
  gradient: string;
  light: string;
  lightText: string;
}> = [
  {
    label: "Total Crops",
    key: "total_crops",
    icon: "grass",
    gradient: "from-brand-700 to-brand-800",
    light: "bg-brand-100",
    lightText: "text-brand-700",
  },
  {
    label: "Disease Types",
    key: "total_diseases",
    fallback: "disease_types",
    icon: "coronavirus",
    gradient: "from-info to-[#1d4ed8]",
    light: "bg-info-soft",
    lightText: "text-info",
  },
  {
    label: "Total Diagnoses",
    key: "total_diagnoses",
    fallback: "total_predictions",
    icon: "biotech",
    gradient: "from-warning to-[#b45309]",
    light: "bg-warning-soft",
    lightText: "text-warning",
  },
  {
    label: "Total Users",
    key: "total_users",
    icon: "group",
    gradient: "from-[#7c3aed] to-[#6d28d9]",
    light: "bg-[#ede9fe]",
    lightText: "text-[#7c3aed]",
  },
];

export function DashboardPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useLoad(fetchAdminDashboard, [], "admin:dashboard");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [deleting, setDeleting] = useState(false);

  const dash: AdminDashboard | null = data;
  const weekly = dash?.weekly ?? [];
  const dist = (dash?.distribution ?? []).map((d) => ({ name: d.name, value: d.value }));
  const recent = dash?.recent ?? [];

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAdminPrediction(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger-soft border border-[#fca5a5] text-danger text-[13px]">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {loading
          ? [1, 2, 3, 4].map((i) => <Sk key={i} className="h-28 rounded-xl" />)
          : STAT_CONFIGS.map((c) => {
              const raw = dash?.[c.key] ?? (c.fallback ? dash?.[c.fallback] : undefined) ?? 0;
              const value = typeof raw === "number" ? raw : 0;
              return (
                <div
                  key={c.label}
                  className={`bg-gradient-to-br ${c.gradient} rounded-xl p-5 text-white shadow-sm relative overflow-hidden`}
                >
                  {/* bg glow */}
                  <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
                  <div className="absolute -right-2 -bottom-4 w-12 h-12 rounded-full bg-white/5" />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <div className="text-[12px] text-white/75 font-medium">{c.label}</div>
                      <div className="text-[32px] font-bold mt-1 leading-none">{value.toLocaleString()}</div>
                    </div>
                    <div className={`w-10 h-10 rounded-lg ${c.light} flex items-center justify-center shrink-0`}>
                      <span className={`material-symbols-outlined ${c.lightText}`} style={{ fontSize: 20 }}>{c.icon}</span>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Line chart */}
        <div className="xl:col-span-8 bg-white rounded-xl border border-line p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Weekly Diagnosis Activity</h3>
              <p className="text-[12px] text-muted mt-0.5">Diagnoses run vs. diseases detected per day</p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-brand-100 text-brand-700 text-[11px] font-semibold">Live</span>
          </div>
          <div className="h-64">
            {loading ? (
              <Sk className="h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 16px rgba(0,0,0,.08)", fontSize: 12 }}
                    cursor={{ stroke: "#e5e7eb" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="predictions" name="Diagnoses" stroke="#16a34a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="diseased" name="Detected" stroke="#ef4444" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Pie chart */}
        <div className="xl:col-span-4 bg-white rounded-xl border border-line p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[15px] font-semibold text-ink">Diagnosis Results</h3>
            <p className="text-[12px] text-muted mt-0.5">Disease distribution breakdown</p>
          </div>
          <div className="h-64">
            {loading ? (
              <Sk className="h-full" />
            ) : dist.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-line" style={{ fontSize: 40 }}>pie_chart</span>
                <p className="text-[13px] text-muted">No diagnosis data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}>
                    {dist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity table */}
      <div className="bg-white rounded-xl border border-line overflow-hidden shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between border-b border-line">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Recent Activity</h3>
            <p className="text-[12px] text-muted">Latest diagnoses submitted to the system</p>
          </div>
          <button
            onClick={() => router.push("/admin/diagnosis")}
            className="flex items-center gap-1 text-[13px] text-brand-700 font-semibold hover:underline"
          >
            View all
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
          </button>
        </div>
        {loading ? (
          <div className="p-5"><Sk className="h-32" /></div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-surface-muted text-muted text-[11px] uppercase">
              <tr>
                {["#", "Image", "Crop Name", "Date", "Result", "Action"].map((h) => (
                  <th key={h} className="py-3 px-4 font-semibold tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted">
                    No recent diagnoses
                  </td>
                </tr>
              )}
              {recent.map((r, i) => (
                <tr key={r.id} className="hover:bg-surface-muted transition-colors">
                  <td className="py-3 px-4 text-muted">{i + 1}</td>
                  <td className="py-3 px-4"><LeafThumb src={r.image_url} alt={r.disease} /></td>
                  <td className="py-3 px-4 font-medium text-ink">{r.crop_name || r.disease}</td>
                  <td className="py-3 px-4 text-muted">{r.date}</td>
                  <td className="py-3 px-4"><ResultBadge value={r.result || r.disease} /></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <IconBtn icon="visibility" title="View" onClick={() => router.push("/admin/diagnosis")} />
                      <IconBtn
                        icon="delete"
                        title="Delete"
                        danger
                        onClick={() => setDeleteTarget({ id: r.id, name: r.crop_name || r.disease })}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete diagnosis"
        message={`Are you sure you want to delete "${deleteTarget?.name ?? "this diagnosis"}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
