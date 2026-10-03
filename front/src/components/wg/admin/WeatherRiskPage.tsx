"use client";

/**
 * Admin · Weather Risk Rules
 *
 * Manages the disease-aware weather rules that the BACKEND scoring engine
 * uses: per-disease factor weights + favorable ranges, and the global
 * score → risk-level threshold table. This page stores rules only — it
 * never calculates or displays risk scores for users.
 *
 * The disease list is auto-sourced from the model's own class list (via
 * /admin/weather/profiles), so a newly trained class appears here without
 * a code change (badged "New" until first saved).
 */

import { useState } from "react";
import {
  fetchWeatherProfiles,
  fetchWeatherThresholds,
  saveWeatherProfile,
  saveWeatherThresholds,
  type RiskThreshold,
  type WeatherFactorConfig,
  type WeatherProfileConfig,
} from "@/lib/api";
import { Field, PrimaryBtn, Sk, Toggle, inputCls, useLoad } from "./ui";

/** Factor keys the scoring engine understands (mirrors backend FACTOR_KEYS). */
const FACTOR_KEYS: Array<{ key: string; label: string; unit: string }> = [
  { key: "temperature", label: "Temperature", unit: "°C" },
  { key: "humidity", label: "Relative Humidity", unit: "%" },
  { key: "rainfall", label: "Rainfall (24h)", unit: "mm" },
  { key: "wind", label: "Wind Speed", unit: "km/h" },
  { key: "dew_point", label: "Dew Point", unit: "°C" },
  { key: "leaf_wetness", label: "Leaf Wetness *", unit: "h" },
];

const levelTone = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes("very high")) return "bg-danger-soft text-danger border-[#fca5a5] dark:border-red-800/50";
  if (n === "high") return "bg-[#ffedd5] text-[#c2410c] border-[#fdba74]";
  if (n === "moderate") return "bg-[#fef9c3] text-wheat-700 border-[#fde047]";
  if (n === "low") return "bg-brand-100 text-brand-700 border-brand-300";
  return "bg-info-soft text-[#0369a1] dark:text-sky-300 border-[#bae6fd]";
};

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function WeatherRiskPage() {
  const { data: profiles, loading, error, reload } = useLoad(fetchWeatherProfiles, [], "admin:wr:profiles");
  const { data: thresholds, reload: reloadThresholds } = useLoad(fetchWeatherThresholds, [], "admin:wr:thresholds");

  const [selected, setSelected] = useState<string | null>(null);
  // Derived default (no effect): first disease in the model list until the
  // admin clicks another one.
  const activeKey = selected ?? profiles?.[0]?.disease_key ?? null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger-soft text-danger text-[13px] border border-[#fca5a5]">
          {error}
        </div>
      )}

      {/* Disease selector — horizontal tabs across the top (every model class) */}
      <div className="bg-white rounded-xl border border-line shadow-sm p-2">
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Wheat diseases
          </span>
          <span className="text-[11px] text-muted hidden sm:inline">
            Pick a disease to edit its weather rules
          </span>
        </div>
        {loading ? (
          <div className="flex gap-2 px-1 pb-1 overflow-x-auto">
            {[1, 2, 3, 4, 5].map((i) => <Sk key={i} className="h-9 w-28 shrink-0" />)}
          </div>
        ) : (
          <div className="flex gap-2 px-1 pb-1 overflow-x-auto">
            {(profiles ?? []).map((p) => {
              const isActive = activeKey === p.disease_key;
              return (
                <button
                  key={p.disease_key}
                  type="button"
                  onClick={() => setSelected(p.disease_key)}
                  className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-brand-700 text-white font-semibold shadow-sm"
                      : "text-ink hover:bg-surface-muted border border-line"
                  }`}
                >
                  <span className="truncate">{p.display_name || p.disease_key}</span>
                  {p.unsaved && (
                    <span className="shrink-0 rounded-full bg-[#fef9c3] text-wheat-700 text-[10px] font-bold px-1.5 py-0.5">
                      New
                    </span>
                  )}
                  {!p.active && (
                    <span className={`shrink-0 rounded-full text-[10px] font-bold px-1.5 py-0.5 ${isActive ? "bg-white/20 text-white" : "bg-surface-muted text-muted"}`}>
                      Off
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main column */}
      <div className="space-y-4 min-w-0">
        {loading && <Sk className="h-72" />}
        {!loading && activeKey && (
          <ProfileEditor
            key={activeKey}
            profile={(profiles ?? []).find((p) => p.disease_key === activeKey)}
            onSaved={reload}
          />
        )}
        {!loading && thresholds && (
          <ThresholdEditor
            /* Remount on refetch so the draft always mirrors saved data. */
            key={thresholds.map((t) => `${t.level_name}:${t.min_score}-${t.max_score}`).join("|")}
            rows={thresholds}
            onSaved={reloadThresholds}
          />
        )}
      </div>
    </div>
  );
}

/* ── Per-disease profile editor ─────────────────────────────────────────────── */

interface DraftFactor extends WeatherFactorConfig {
  /** allow toggle even before first save */
  enabled: boolean;
}

function ProfileEditor({
  profile,
  onSaved,
}: {
  profile?: WeatherProfileConfig;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [scientific, setScientific] = useState(profile?.scientific_name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [active, setActive] = useState(profile?.active ?? true);
  const [factors, setFactors] = useState<DraftFactor[]>(() => buildDraftFactors(profile));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  if (!profile) {
    return (
      <div className="bg-white rounded-xl border border-line p-8 text-center text-[13px] text-muted shadow-sm">
        Select a disease to edit its weather rules.
      </div>
    );
  }

  const patch = (key: string, fields: Partial<WeatherFactorConfig>) =>
    setFactors((fs) => fs.map((f) => (f.factor_key === key ? { ...f, ...fields } : f)));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await saveWeatherProfile(profile.disease_key, {
        display_name: displayName.trim() || profile.disease_key,
        slug: profile.slug ?? "",
        description: description.trim(),
        scientific_name: scientific.trim(),
        active,
        display_order: profile.display_order ?? 0,
        factors: factors
          .filter((f) => f.enabled)
          .map((f) => ({
            factor_key: f.factor_key,
            weight: f.weight,
            min_value: f.min_value,
            max_value: f.max_value,
            unit: f.unit,
            explanation: f.explanation,
            active: f.active,
          })),
      });
      setMsg({ kind: "ok", text: "Rules saved — user risk updates immediately." });
      onSaved();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDisplayName(profile.display_name ?? "");
    setScientific(profile.scientific_name ?? "");
    setDescription(profile.description ?? "");
    setActive(profile.active ?? true);
    setFactors(buildDraftFactors(profile));
    setMsg(null);
  };

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm">
      <div className="px-5 py-4 border-b border-surface-muted flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-ink">
            Weather rules · {profile.disease_key}
            {profile.unsaved && (
              <span className="ml-2 rounded-full bg-[#fef9c3] text-wheat-700 text-[10px] font-bold px-2 py-0.5 align-middle">
                Not saved yet
              </span>
            )}
          </h2>
          <p className="text-[12px] text-muted mt-0.5">
            Weights and ranges feed the backend scoring engine for this disease only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted">Profile active</span>
          <Toggle checked={active} onChange={setActive} />
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Display name">
            <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Scientific name">
            <input className={inputCls} value={scientific} onChange={(e) => setScientific(e.target.value)} placeholder="e.g. Puccinia striiformis" />
          </Field>
        </div>
        <Field label="Notes (shown to admins only)">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why these ranges were chosen…" />
        </Field>

        {/* Factor table */}
        <div className="rounded-lg border border-line overflow-x-auto">
          <table className="w-full text-left text-[13px] min-w-[720px]">
            <thead className="bg-surface-muted text-muted text-[11px] uppercase">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Use</th>
                <th className="py-2.5 px-3 font-semibold">Weather factor</th>
                <th className="py-2.5 px-3 font-semibold">Weight</th>
                <th className="py-2.5 px-3 font-semibold">Favorable min</th>
                <th className="py-2.5 px-3 font-semibold">Favorable max</th>
                <th className="py-2.5 px-3 font-semibold">Unit</th>
                <th className="py-2.5 px-3 font-semibold">Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {factors.map((f) => {
                const meta = FACTOR_KEYS.find((k) => k.key === f.factor_key);
                const isLeaf = f.factor_key === "leaf_wetness";
                return (
                  <tr key={f.factor_key} className={f.enabled ? "" : "opacity-50"}>
                    <td className="py-2 px-3">
                      <Toggle
                        checked={f.enabled}
                        disabled={isLeaf}
                        onChange={(v) => setFactors((fs) => fs.map((x) => (x.factor_key === f.factor_key ? { ...x, enabled: v, active: v } : x)))}
                      />
                    </td>
                    <td className="py-2 px-3 font-semibold text-ink whitespace-nowrap">
                      {meta?.label ?? f.factor_key}
                    </td>
                    <td className="py-2 px-3 w-24">
                      <input
                        type="number" min={0} max={100} disabled={!f.enabled}
                        className={inputCls}
                        style={{ paddingBlock: 6 }}
                        value={f.weight}
                        onChange={(e) => patch(f.factor_key, { weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      />
                    </td>
                    <td className="py-2 px-3 w-28">
                      <input
                        type="number" disabled={!f.enabled} className={inputCls} style={{ paddingBlock: 6 }}
                        value={f.min_value ?? ""}
                        onChange={(e) => patch(f.factor_key, { min_value: num(e.target.value) })}
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2 px-3 w-28">
                      <input
                        type="number" disabled={!f.enabled} className={inputCls} style={{ paddingBlock: 6 }}
                        value={f.max_value ?? ""}
                        onChange={(e) => patch(f.factor_key, { max_value: num(e.target.value) })}
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2 px-3 w-20">
                      <input
                        disabled={!f.enabled} className={inputCls} style={{ paddingBlock: 6 }}
                        value={f.unit}
                        onChange={(e) => patch(f.factor_key, { unit: e.target.value })}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        disabled={!f.enabled} className={inputCls} style={{ paddingBlock: 6 }}
                        value={f.explanation}
                        onChange={(e) => patch(f.factor_key, { explanation: e.target.value })}
                        placeholder="Why this range…"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted leading-relaxed">
          * Leaf wetness is not measured by the weather provider, so it stays
          unavailable and is excluded from scoring everywhere. Weights are
          relative — the backend normalizes over the factors that have live
          values at calculation time.
        </p>

        {msg && (
          <div
            className={`px-4 py-2.5 rounded-lg text-[13px] border ${
              msg.kind === "ok"
                ? "bg-brand-50 text-brand-700 border-brand-200"
                : "bg-danger-soft text-danger border-[#fca5a5]"
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors"
          >
            Reset
          </button>
          <PrimaryBtn disabled={busy} onClick={save}>
            {busy ? "Saving…" : `Save ${profile.disease_key} rules`}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function buildDraftFactors(profile?: WeatherProfileConfig): DraftFactor[] {
  return FACTOR_KEYS.map(({ key, unit }) => {
    const stored = profile?.factors?.find((f) => f.factor_key === key);
    return {
      factor_key: key,
      weight: stored?.weight ?? 0,
      min_value: stored?.min_value ?? null,
      max_value: stored?.max_value ?? null,
      unit: stored?.unit ?? unit,
      explanation: stored?.explanation ?? "",
      active: stored?.active ?? true,
      enabled: stored ? (stored.active ?? true) : false,
    };
  });
}

/* ── Global threshold editor ────────────────────────────────────────────────── */

function ThresholdEditor({
  rows,
  onSaved,
}: {
  rows: RiskThreshold[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<RiskThreshold[]>(rows);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const patch = (i: number, fields: Partial<RiskThreshold>) =>
    setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, ...fields } : r)));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await saveWeatherThresholds(draft);
      setMsg({ kind: "ok", text: "Thresholds saved — risk levels recalculated on the next request." });
      onSaved();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm">
      <div className="px-5 py-4 border-b border-surface-muted">
        <h2 className="text-[15px] font-bold text-ink">Risk level thresholds</h2>
        <p className="text-[12px] text-muted mt-0.5">
          One global score → level mapping used for every disease (0–100).
        </p>
      </div>
      <div className="p-5 space-y-3">
        <table className="w-full text-left text-[13px]">
          <thead className="text-muted text-[11px] uppercase">
            <tr>
              <th className="py-2 px-2 font-semibold">Level</th>
              <th className="py-2 px-2 font-semibold w-28">Min score</th>
              <th className="py-2 px-2 font-semibold w-28">Max score</th>
              <th className="py-2 px-2 font-semibold">Preview</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-muted">
            {draft.map((t, i) => (
              <tr key={t.level_name}>
                <td className="py-2 px-2 font-semibold text-ink whitespace-nowrap">{t.level_name}</td>
                <td className="py-2 px-2">
                  <input
                    type="number" min={0} max={100} className={inputCls} style={{ paddingBlock: 6 }}
                    value={t.min_score}
                    onChange={(e) => patch(i, { min_score: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="py-2 px-2">
                  <input
                    type="number" min={0} max={100} className={inputCls} style={{ paddingBlock: 6 }}
                    value={t.max_score}
                    onChange={(e) => patch(i, { max_score: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="py-2 px-2">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${levelTone(t.level_name)}`}>
                    {t.min_score}–{t.max_score}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {msg && (
          <div
            className={`px-4 py-2.5 rounded-lg text-[13px] border ${
              msg.kind === "ok"
                ? "bg-brand-50 text-brand-700 border-brand-200"
                : "bg-danger-soft text-danger border-[#fca5a5]"
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => { setDraft(rows); setMsg(null); }}
            className="px-4 py-2 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors"
          >
            Reset
          </button>
          <PrimaryBtn disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save thresholds"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
