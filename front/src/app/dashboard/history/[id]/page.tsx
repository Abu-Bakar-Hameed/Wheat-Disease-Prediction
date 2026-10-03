"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import {
  buildPredictionFollowupPrefill,
  createReminder,
  fetchHistoryItem,
  getCachedUserSettings,
  regenerateDiagnosisReport,
  generateSinglePptx,
  generateSingleImage,
  recordActivityEvent,
  type HistoryItem,
  type AiDiagnosisReport,
} from "@/lib/api";
import { resolveAiReport } from "@/lib/diagnosisReport";
import { downloadBlob, sanitiseFilename } from "@/lib/download";
import { generatePredictionPdf } from "@/lib/generatePdf";
import { getConfidenceTier } from "@/lib/confidence";
import {
  formatDate as fmtDateSettings,
  formatDateTime as fmtDateTimeSettings,
} from "@/lib/settingsFormat";

/* ============================================================================
   HELPERS  (mirrors HistoryView helpers)
============================================================================ */

function formatDisease(value: unknown) {
  const text = String(value ?? "Unknown").replace(/_/g, " ").trim();
  if (!text) return "Unknown";
  return text
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(value: unknown) {
  if (!value) return "—";
  return fmtDateSettings(String(value), getCachedUserSettings()) || "—";
}

function formatDateTime(value: unknown) {
  if (!value) return "—";
  return fmtDateTimeSettings(String(value), getCachedUserSettings()) || "—";
}

function toText(value: unknown, fallback = "") {
  if (Array.isArray(value)) {
    const joined = value.filter(Boolean).map(String).join(" | ").trim();
    return joined || fallback;
  }
  return String(value ?? "").trim() || fallback;
}

function getConfidence(item: HistoryItem): number {
  const raw =
    (item as any)?.confidence ??
    (item as any)?.confidence_score ??
    (item as any)?.confidence_pct ??
    (item as any)?.confidence_percentage ?? 0;
  const v = Number(raw);
  if (!Number.isFinite(v)) return 0;
  return v > 1 ? Math.min(v / 100, 1) : Math.max(0, Math.min(v, 1));
}

function getPredictionId(item: HistoryItem): string {
  return String((item as any)?.prediction_id ?? (item as any)?.id ?? "");
}

function getDisease(item: HistoryItem): string {
  return String(
    (item as any)?.predicted_class ??
    (item as any)?.prediction ??
    (item as any)?.disease ??
    (item as any)?.disease_name ?? "Unknown"
  );
}

function getCreatedAt(item: HistoryItem): string {
  return String(
    (item as any)?.created_at ??
    (item as any)?.date_created ??
    (item as any)?.date ??
    (item as any)?.timestamp ?? ""
  );
}

function getFilename(item: HistoryItem): string {
  return String(
    (item as any)?.filename ??
    (item as any)?.file_name ??
    (item as any)?.image_name ?? "Wheat Leaf"
  );
}

function getSeverity(item: HistoryItem): string {
  return String((item as any)?.severity ?? (item as any)?.severity_level ?? "—");
}

function getImageUrl(item: HistoryItem): string {
  const raw = String(
    (item as any)?.image_url ??
    (item as any)?.imageUrl ??
    (item as any)?.original_image_url ??
    (item as any)?.image_path ??
    (item as any)?.file_url ?? ""
  ).trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) return raw;
  if (raw.startsWith("/_next/") || raw.startsWith("/images/")) return raw;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
}

function historyItemToPredictionForPdf(item: HistoryItem) {
  const disease = getDisease(item);
  const confidence = getConfidence(item);
  const raw = item as any;
  const topPredictions = Array.isArray(raw.top_predictions)
    ? raw.top_predictions
    : [{ rank: 1, class_name: disease, confidence, confidence_percentage: confidence * 100 }];
  return {
    prediction_id: getPredictionId(item),
    prediction: disease,
    confidence,
    confidence_percentage: confidence * 100,
    confidence_level: confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Medium" : "Low",
    low_confidence: confidence < 0.5,
    severity: getSeverity(item),
    top_predictions: topPredictions,
    disease_info: {
      display_name: raw.display_name ?? formatDisease(disease),
      description: raw.description ?? "",
      symptoms: Array.isArray(raw.symptoms) ? raw.symptoms : [],
      prevention: Array.isArray(raw.prevention) ? raw.prevention : [],
      management: Array.isArray(raw.management) ? raw.management : [],
      severity: raw.severity ?? getSeverity(item),
      risk_level: raw.risk_level ?? getSeverity(item),
      disclaimer: raw.disclaimer ?? "AI prediction only. Consult a qualified agricultural expert before treatment.",
    },
    recommendation: raw.recommendation ?? raw.ai_recommendation ?? "",
    gradcam: raw.gradcam ?? raw.gradcam_url ?? null,
    gradcam_available: Boolean(raw.gradcam_available ?? raw.gradcam ?? raw.gradcam_url),
    inference_time_ms: Number(raw.inference_time_ms ?? raw.inference_time ?? 0),
    model_version: raw.model_version ?? "—",
    image_url: getImageUrl(item) || undefined,
    ai_report: raw.ai_report ?? raw.diagnosis_report ?? null,
  } as any;
}

/* ============================================================================
   SUB-COMPONENTS
============================================================================ */

function ConfidenceRing({ confidence, disease }: { confidence: number; disease?: string | null }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(confidence, 0), 1));
  const tier = getConfidenceTier(confidence, disease);

  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90">
        <circle cx="50" cy="50" r={radius} strokeWidth="7" className="fill-none stroke-emerald-50" />
        <circle
          cx="50" cy="50" r={radius} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`fill-none transition-all duration-700 ${tier.strokeClass}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[26px] font-bold leading-none text-ink">
          {(confidence * 100).toFixed(1)}%
        </span>
        <span className="mt-1.5 text-[12px] font-medium text-muted">Confidence</span>
      </div>
    </div>
  );
}

function severityBadgeClass(severity: string) {
  const v = severity.toLowerCase();
  if (v.includes("critical") || v.includes("severe") || v.includes("high")) return "bg-red-50 text-red-600 border-red-100 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/50";
  if (v.includes("moderate") || v.includes("medium")) return "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50";
  if (v.includes("low") || v.includes("mild") || v.includes("healthy")) return "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50";
  return "bg-surface-muted text-muted border-line";
}

function severityIcon(severity: string) {
  const v = severity.toLowerCase();
  if (v.includes("critical") || v.includes("severe") || v.includes("high")) return "error";
  if (v.includes("moderate") || v.includes("medium")) return "warning";
  if (v.includes("low") || v.includes("mild") || v.includes("healthy")) return "check_circle";
  return "info";
}

/* Shared tier system (lib/confidence): proportional width, dynamic colour.
   Red stays reserved for disease severity — low confidence renders as orange. */
function confidenceBarClass(confidence: number, disease?: string | null) {
  return getConfidenceTier(confidence, disease).barClass;
}

function confidenceNote(confidence: number) {
  if (confidence >= 0.8) return "The AI model is highly confident in this diagnosis.";
  if (confidence >= 0.5) return "The AI model has moderate confidence. Consider a second opinion for critical decisions.";
  return "The AI model is less certain. Please review field conditions and expert guidance.";
}

function InfoPanel({
  icon, title, tone, children,
}: {
  icon: string; title: string;
  tone: "problem" | "recommendation" | "solution";
  children: React.ReactNode;
}) {
  const tones = {
    problem:        { border: "border-red-100 dark:border-red-900/50",     tile: "bg-red-50 dark:bg-red-950/40",     icon: "text-red-500" },
    recommendation: { border: "border-amber-100 dark:border-amber-900/50",   tile: "bg-amber-50 dark:bg-amber-950/40",   icon: "text-amber-500" },
    solution:       { border: "border-emerald-100 dark:border-emerald-900/50", tile: "bg-emerald-50 dark:bg-emerald-950/40", icon: "text-emerald-600 dark:text-emerald-400" },
  }[tone];

  return (
    <div className={`rounded-2xl border ${tones.border} bg-surface p-5`}>
      <div className="flex items-center gap-3 pb-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones.tile}`}>
          <span className={`material-symbols-outlined ${tones.icon}`} style={{ fontSize: 22 }}>
            {icon}
          </span>
        </div>
        <h4 className="text-[16px] font-bold text-ink">{title}</h4>
      </div>
      <div className="border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
        {children}
      </div>
    </div>
  );
}

/* ============================================================================
   PAGE
============================================================================ */

export default function HistoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [item, setItem] = useState<HistoryItem | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [report, setReport] = useState<AiDiagnosisReport | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [reportError, setReportError] = useState("");

  const [exportLoading, setExportLoading] = useState<"pdf" | "pptx" | "image" | null>(null);
  const [exportError, setExportError] = useState("");

  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderAdded, setReminderAdded] = useState(false);

  /* ── Load item ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    (async () => {
      setPageLoading(true);
      setPageError("");
      try {
        const data = await fetchHistoryItem(id);
        if (cancelled) return;

        setItem(data);

        // Record the activity event once per successful load (best-effort).
        void recordActivityEvent("prediction_completed_viewed", { predictionId: id });

        const raw = data as any;
        const existing = raw.ai_report ?? raw.diagnosis_report ?? null;
        const disease = getDisease(data);
        const confidence = getConfidence(data);
        const rec = raw.recommendation ?? "";
        setReport(existing ? resolveAiReport(existing, disease, confidence * 100, rec) : null);
      } catch (err) {
        if (!cancelled) {
          setPageError(err instanceof Error ? err.message : "Unable to load this prediction.");
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  /* ── Regenerate AI report ──────────────────────────────────────────────── */

  const handleRegenerate = async () => {
    if (!item) return;
    const predictionId = getPredictionId(item);
    if (!predictionId) { setReportError("Prediction ID is missing."); return; }

    setRegenerating(true);
    setReportError("");

    try {
      const result = await regenerateDiagnosisReport(predictionId);
      const generated = (result as any)?.ai_report ?? (result as any)?.report ?? result;
      const disease = getDisease(item);
      const confidence = getConfidence(item);
      const rec = (item as any).recommendation ?? "";
      setReport(resolveAiReport(generated, disease, confidence * 100, rec));
      setItem((prev) => prev ? { ...prev, ...(result as any) } as HistoryItem : prev);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Unable to regenerate AI report.");
    } finally {
      setRegenerating(false);
    }
  };

  /* ── Export ────────────────────────────────────────────────────────────── */

  const handleExport = async (format: "pdf" | "pptx" | "image") => {
    if (!item) return;
    const predictionId = getPredictionId(item);
    const disease = getDisease(item);

    setExportLoading(format);
    setExportError("");

    try {
      const datePart = new Date().toISOString().slice(0, 10);
      const baseName = sanitiseFilename("WheatGuard", disease.slice(0, 24), predictionId.slice(0, 8), datePart);

      if (format === "pdf") {
        await generatePredictionPdf(historyItemToPredictionForPdf(item));
        return;
      }

      if (!predictionId) throw new Error("This record does not have a valid prediction ID.");

      if (format === "pptx") {
        const blob = await generateSinglePptx(predictionId);
        downloadBlob(blob, `${baseName}_report.pptx`);
        return;
      }

      if (format === "image") {
        const blob = await generateSingleImage(predictionId);
        downloadBlob(blob, `${baseName}_report.png`);
        return;
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setExportLoading(null);
    }
  };

  /* ── Follow-up reminder (spec §24 — explicit user action, never auto-created) */

  const handleFollowupReminder = async () => {
    if (!item) return;
    setReminderBusy(true);
    setExportError("");
    try {
      await createReminder(buildPredictionFollowupPrefill({ id, disease: getDisease(item) }));
      setReminderAdded(true);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not create the reminder.");
    } finally {
      setReminderBusy(false);
    }
  };

  /* ── Loading / error states ────────────────────────────────────────────── */

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-surface-muted">
        <div className="mx-auto max-w-5xl space-y-5 p-6 lg:p-8">
          {/* Breadcrumb skeleton */}
          <div className="h-5 w-64 animate-pulse rounded-lg bg-surface-muted" />
          {/* Card skeletons */}
          <div className="h-48 animate-pulse rounded-2xl bg-surface-muted" />
          <div className="grid gap-5 lg:grid-cols-[440px_1fr]">
            <div className="h-72 animate-pulse rounded-2xl bg-surface-muted" />
            <div className="h-72 animate-pulse rounded-2xl bg-surface-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (pageError || !item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
          <span className="material-symbols-outlined text-red-500" style={{ fontSize: 32 }}>error</span>
        </div>
        <h2 className="text-xl font-bold text-ink">Could not load prediction</h2>
        <p className="text-sm text-muted">{pageError || "Record not found."}</p>
        <Link
          href="/dashboard/history"
          className="mt-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
        >
          ← Back to History
        </Link>
      </div>
    );
  }

  /* ── Derived values ────────────────────────────────────────────────────── */

  const disease = getDisease(item);
  const confidence = getConfidence(item);
  const severity = getSeverity(item);
  const imageUrl = getImageUrl(item);
  const predictionId = getPredictionId(item);
  const raw = item as any;
  const ai = (report ?? {}) as any;
  const healthy = disease.toLowerCase().includes("healthy");

  const scientificName: string = raw.scientific_name ?? raw.disease_info?.scientific_name ?? raw.latin_name ?? "";

  const problem = toText(
    ai.problem ?? raw.problem ?? raw.description ?? raw.disease_info?.description,
    "No problem details available."
  );
  const recommendation = toText(
    ai.recommendation ?? raw.recommendation ?? raw.disease_info?.recommendation ?? raw.management,
    "No recommendation available."
  );
  const solution = toText(
    ai.solution ?? raw.solution ?? raw.disease_info?.solution,
    "No solution available."
  );

  const confidenceLevel = confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Medium" : "Low";
  const confidenceBadge =
    confidence >= 0.8
      ? "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300"
      : confidence >= 0.5
      ? "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300"
      : "border-red-100 bg-red-50 text-red-600 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300";

  const topPredictions: Array<{ rank: number; class_name: string; confidence: number; confidence_percentage: number }> =
    Array.isArray(raw.top_predictions) ? raw.top_predictions : [];

  const symptoms: string[] = Array.isArray(raw.symptoms) ? raw.symptoms
    : Array.isArray(raw.disease_info?.symptoms) ? raw.disease_info.symptoms : [];
  const prevention: string[] = Array.isArray(raw.prevention) ? raw.prevention
    : Array.isArray(raw.disease_info?.prevention) ? raw.disease_info.prevention : [];
  const management: string[] = Array.isArray(raw.management) ? raw.management
    : Array.isArray(raw.disease_info?.management) ? raw.disease_info.management : [];

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <main className="min-h-screen bg-surface-muted">

      {/* ===================================================================
          HEADER
      =================================================================== */}
      <div className="border-b bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {/* Breadcrumb */}
              <div className="mb-2 flex items-center gap-2 text-sm text-muted">
                <Link href="/dashboard" className="hover:text-emerald-600">Dashboard</Link>
                <span>/</span>
                <Link href="/dashboard/history" className="hover:text-emerald-600">History</Link>
                <span>/</span>
                <span className="max-w-[180px] truncate text-ink">{formatDisease(disease)}</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40">
                  <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400" style={{ fontSize: 24 }}>eco</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-400">
                    Diagnostic Record
                  </p>
                  <h1 className="text-xl font-bold leading-tight text-ink sm:text-2xl">
                    {formatDisease(disease)}
                  </h1>
                </div>
              </div>

              <p className="mt-1 pl-14 text-[13px] text-muted">
                {formatDateTime(getCreatedAt(item))} · ID: {predictionId.slice(0, 8)}…
              </p>
            </div>

            {/* Export buttons */}
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleExport("pdf")}
                disabled={exportLoading !== null}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink shadow-sm transition hover:bg-surface-muted disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[17px] text-red-500">
                  {exportLoading === "pdf" ? "progress_activity" : "picture_as_pdf"}
                </span>
                PDF
              </button>
              <button
                type="button"
                onClick={() => handleExport("pptx")}
                disabled={exportLoading !== null}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink shadow-sm transition hover:bg-surface-muted disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[17px] text-orange-500">
                  {exportLoading === "pptx" ? "progress_activity" : "slideshow"}
                </span>
                PPTX
              </button>
              <button
                type="button"
                onClick={() => handleExport("image")}
                disabled={exportLoading !== null}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink shadow-sm transition hover:bg-surface-muted disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[17px] text-blue-500">
                  {exportLoading === "image" ? "progress_activity" : "image"}
                </span>
                Image
              </button>
              {getCachedUserSettings().calendar_preferences?.suggest_prediction_followup !== false && (
                <button
                  type="button"
                  onClick={() => void handleFollowupReminder()}
                  disabled={reminderBusy}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                >
                  <span className="material-symbols-outlined text-[17px] text-emerald-600">
                    {reminderBusy ? "progress_activity" : reminderAdded ? "check_circle" : "event_available"}
                  </span>
                  {reminderAdded ? "Reminder added" : "Follow-up reminder"}
                </button>
              )}
              <Link
                href="/dashboard/history"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <span className="material-symbols-outlined text-[17px]">arrow_back</span>
                Back
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          BODY
      =================================================================== */}
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">

        {/* Export error */}
        {exportError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            <span className="material-symbols-outlined shrink-0 text-[19px]">error</span>
            <p className="flex-1 text-[13px]">{exportError}</p>
            <button type="button" onClick={() => setExportError("")} className="text-red-400 hover:text-red-700 dark:hover:text-red-300">
              <span className="material-symbols-outlined text-[17px]">close</span>
            </button>
          </div>
        )}

        {/* ── Image + AI Prediction ── */}
        <div className="grid gap-5 lg:grid-cols-[440px_1fr]">

          {/* Image card */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface p-2">
            <div className="overflow-hidden rounded-xl bg-surface-muted">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={formatDisease(disease)}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center">
                  <span className="material-symbols-outlined text-6xl text-muted">image</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 px-3 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                <span className="material-symbols-outlined text-muted" style={{ fontSize: 20 }}>image</span>
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-muted">Original file</p>
                <p className="truncate text-[14px] font-semibold text-ink">{getFilename(item)}</p>
              </div>
            </div>
          </div>

          {/* AI Prediction card */}
          <div className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                AI Prediction
              </span>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Severity</p>
                <span className={`mt-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[14px] font-semibold capitalize ${severityBadgeClass(severity)}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{severityIcon(severity)}</span>
                  {severity}
                </span>
              </div>
            </div>

            <h3 className="mt-4 text-[26px] font-bold leading-tight text-ink">
              {formatDisease(disease)}
            </h3>
            {scientificName && (
              <p className="mt-1 text-[15px] italic text-muted">({scientificName})</p>
            )}

            <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
              <ConfidenceRing confidence={confidence} disease={disease} />
              <div className="w-full flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-bold text-ink">AI Confidence</p>
                  <span className={`rounded-lg border px-3 py-1 text-[13px] font-semibold ${confidenceBadge}`}>
                    {confidenceLevel}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${confidenceBarClass(confidence, disease)}`}
                    style={{ width: `${Math.min(Math.max(confidence * 100, 0), 100)}%` }}
                  />
                </div>
                <p className={`mt-2 text-[12px] font-semibold ${getConfidenceTier(confidence, disease).textClass}`}>
                  {getConfidenceTier(confidence, disease).label}
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
                  {confidenceNote(confidence)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Problem / Recommendation / Solution ── */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <InfoPanel icon="coronavirus" title="Problem" tone="problem">{problem}</InfoPanel>
          <InfoPanel icon="lightbulb" title="Recommendation" tone="recommendation">{recommendation}</InfoPanel>
          <InfoPanel icon="check_circle" title="Solution" tone="solution">{solution}</InfoPanel>
        </div>

        {/* ── Top Predictions ── */}
        {topPredictions.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-4 text-[15px] font-bold text-ink">Top Predictions</h2>
            <div className="space-y-3">
              {topPredictions.map((p, i) => {
                const conf = p.confidence > 1 ? p.confidence / 100 : p.confidence;
                const tier = getConfidenceTier(conf, p.class_name);
                return (
                  <div key={i} className="rounded-xl bg-surface-muted p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-[11px] font-black text-muted shadow-sm">
                          #{p.rank}
                        </div>
                        <p className="text-[13px] font-bold text-ink">{p.class_name}</p>
                      </div>
                      <p className={`text-[13px] font-black ${tier.textClass}`}>
                        {(conf * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className={`h-full rounded-full ${tier.barClass}`}
                        style={{ width: `${Math.min(conf * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Disease details ── */}
        {(symptoms.length > 0 || prevention.length > 0 || management.length > 0) && (
          <section className="grid gap-4 md:grid-cols-3">
            {symptoms.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <h4 className="mb-3 text-[14px] font-bold text-ink">Symptoms</h4>
                <ul className="space-y-2">
                  {symptoms.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-5 text-muted">
                      <span className="text-red-400">•</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {prevention.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <h4 className="mb-3 text-[14px] font-bold text-ink">Prevention</h4>
                <ul className="space-y-2">
                  {prevention.map((p, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-5 text-muted">
                      <span className="text-emerald-500">✓</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {management.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <h4 className="mb-3 text-[14px] font-bold text-ink">Management</h4>
                <ul className="space-y-2">
                  {management.map((m, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-5 text-muted">
                      <span className="text-blue-400">•</span>{m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ── AI Report ── */}
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-ink">AI Diagnosis Report</h2>
              <p className="mt-0.5 text-[12px] text-muted">Structured explanation and recommendation.</p>
            </div>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              <span className={`material-symbols-outlined text-[18px] ${regenerating ? "animate-spin" : ""}`}>
                {regenerating ? "progress_activity" : "refresh"}
              </span>
              {regenerating ? "Regenerating…" : report ? "Regenerate" : "Generate"}
            </button>
          </div>

          {reportError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-800 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
              {reportError}
            </div>
          )}

          {report ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-surface-muted p-4 md:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Report Title</p>
                <h4 className="mt-1 text-[16px] font-bold text-ink">{report.title}</h4>
                {report.generated_by && (
                  <p className="mt-0.5 text-[11px] text-muted">Generated by {report.generated_by}</p>
                )}
              </div>
              <div className="rounded-xl border border-line p-4">
                <h4 className="mb-2 text-[13px] font-bold text-ink">Problem</h4>
                <p className="text-[12px] leading-6 text-muted">{report.problem}</p>
              </div>
              <div className="rounded-xl border border-line p-4">
                <h4 className="mb-2 text-[13px] font-bold text-ink">Recommendation</h4>
                <p className="text-[12px] leading-6 text-muted">{report.recommendation}</p>
              </div>
              <div className="rounded-xl border border-line p-4 md:col-span-2">
                <h4 className="mb-2 text-[13px] font-bold text-ink">Solution</h4>
                <p className="text-[12px] leading-6 text-muted">{report.solution}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface-muted p-6 text-center">
              <p className="text-[12px] text-muted">
                Click <strong>Generate</strong> to create a structured AI diagnosis report.
              </p>
            </div>
          )}
        </section>

        {/* ── Meta ── */}
        <section className="rounded-2xl border border-line bg-surface-muted p-5">
          <h2 className="mb-4 text-[14px] font-bold text-ink">Model Information</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Model Version",    value: raw.model_version ?? "—" },
              { label: "Inference Time",   value: raw.inference_time_ms ? `${raw.inference_time_ms} ms` : "—" },
              { label: "Prediction ID",    value: predictionId.slice(0, 16) + "…" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl bg-surface p-4">
                <p className="text-[11px] text-muted">{m.label}</p>
                <p className="mt-1 text-[13px] font-bold text-ink break-all">{m.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Bottom actions ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Link
            href="/dashboard/history"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-[13px] font-bold text-ink transition hover:bg-surface-muted"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to History
          </Link>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={exportLoading !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-bold text-ink transition hover:bg-surface-muted disabled:opacity-50"
            >
              {exportLoading === "pdf" ? "Exporting…" : "📄 Export PDF"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("pptx")}
              disabled={exportLoading !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-bold text-ink transition hover:bg-surface-muted disabled:opacity-50"
            >
              {exportLoading === "pptx" ? "Exporting…" : "📊 Export PPTX"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("image")}
              disabled={exportLoading !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-bold text-ink transition hover:bg-surface-muted disabled:opacity-50"
            >
              {exportLoading === "image" ? "Exporting…" : "🖼️ Export Image"}
            </button>
            <Link
              href="/dashboard/detection"
              className="rounded-xl bg-emerald-600 px-4 py-3 text-[13px] font-bold text-white transition hover:bg-emerald-700"
            >
              📷 New Scan
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
