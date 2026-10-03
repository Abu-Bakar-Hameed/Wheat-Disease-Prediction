"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  ApiError,
  type PredictionResponse,
  type AiDiagnosisReport,
  regenerateDiagnosisReport,
  generateSingleImage,
  generateSinglePptx,
  PREDICTION_PREF_DEFAULTS,
} from "@/lib/api";
import { useApp } from "@/lib/appState";
import { useUserSettings } from "@/lib/useUserSettings";
import {
  formatConfidence,
  getConfidenceTier,
  toConfidencePercent,
} from "@/lib/confidence";

/* =========================================================
   HELPERS
========================================================= */

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message || "Something went wrong.";
  if (error instanceof Error) return error.message || "Something went wrong.";
  return "Something went wrong. Please try again.";
}

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

function getSeverityClass(severity?: string) {
  const v = (severity ?? "").toLowerCase();
  if (v.includes("high") || v.includes("severe") || v.includes("critical"))
    return "bg-red-100 text-red-700 border-red-200";
  if (v.includes("medium") || v.includes("moderate"))
    return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function getRiskClass(risk?: string) {
  const v = (risk ?? "").toLowerCase();
  if (v.includes("high") || v.includes("severe") || v.includes("critical"))
    return "bg-red-100 text-red-700 border-red-200";
  if (v.includes("medium") || v.includes("moderate"))
    return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function StatusBadge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================================================
   PAGE
========================================================= */

export default function DetectionResultPage() {
  const router = useRouter();
  const { lastResult, lastImageUrl } = useApp();
  const { settings } = useUserSettings();
  // Presentation-only view toggles (Settings → Prediction). They hide content
  // that was already generated — never the generation itself.
  const pp = settings.prediction_preferences ?? PREDICTION_PREF_DEFAULTS;
  const showGradcam = pp.show_gradcam !== false;
  const showTop = pp.show_top !== false;
  const showAiReport = pp.show_ai_report !== false;
  const showLowConfidence = pp.low_confidence_warning !== false;

  const result = lastResult;
  const previewUrl = lastImageUrl;

  const [error, setError] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<"image" | "pptx" | null>(null);
  const [aiReport, setAiReport] = useState<AiDiagnosisReport | null>(
    result?.ai_report ?? null
  );

  // If someone lands here with no result (e.g. direct URL), send them back
  useEffect(() => {
    if (!result) {
      router.replace("/dashboard/detection");
    }
  }, [result, router]);

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="text-muted">Redirecting…</p>
      </div>
    );
  }

  const diseaseInfo = result.disease_info;
  const gradcam = result.gradcam;

  // Visual-only classification of the backend-provided risk / severity.
  // The actual risk is computed on the backend; we only read it here.
  const riskText = `${diseaseInfo?.risk_level ?? ""} ${result.severity ?? ""}`.toLowerCase();
  const isCriticalRisk = riskText.includes("critical") || riskText.includes("severe");
  const isHighRisk = riskText.includes("high");
  const showRiskAlert = isCriticalRisk || isHighRisk;

  // Confidence tiering is visual-only — the value itself is the raw model
  // softmax output from the backend, never adjusted here.
  const confTier = getConfidenceTier(result.confidence, result.prediction);
  const isHealthyPrediction = (result.prediction ?? "")
    .toLowerCase()
    .includes("healthy");

  /* -------------------------------------------------------
     HANDLERS
  ------------------------------------------------------- */

  const handleGenerateReport = async () => {
    setReportLoading(true);
    setError("");
    try {
      const report = await regenerateDiagnosisReport(result.prediction_id);
      setAiReport(report);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportImage = async () => {
    setExportLoading("image");
    setError("");
    try {
      const blob = await generateSingleImage(result.prediction_id);
      downloadBlob(blob, `wheatguard-${result.prediction || "diagnosis"}.png`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportPptx = async () => {
    setExportLoading("pptx");
    setError("");
    try {
      const blob = await generateSinglePptx(result.prediction_id);
      downloadBlob(blob, `wheatguard-${result.prediction || "diagnosis"}.pptx`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExportLoading(null);
    }
  };

  /* -------------------------------------------------------
     RENDER
  ------------------------------------------------------- */

  return (
    <main className="min-h-screen bg-canvas">

      {/* ===================================================
          PAGE HEADER
      =================================================== */}
      <div className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-muted">
                <Link href="/dashboard" className="hover:text-brand-600">Dashboard</Link>
                <span>/</span>
                <Link href="/dashboard/detection" className="hover:text-brand-600">Predict Disease</Link>
                <span>/</span>
                <span className="text-ink">Result</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  <span className="material-symbols-outlined mr-1" style={{ fontSize: 15 }}>check_circle</span>
                  AI Analysis Complete
                </StatusBadge>
                {result.low_confidence && (
                  <StatusBadge className="border-amber-200 bg-amber-50 text-amber-700">
                    <span className="material-symbols-outlined mr-1" style={{ fontSize: 15 }}>warning</span>
                    Low Confidence
                  </StatusBadge>
                )}
              </div>

              <h1 className="mt-2 text-2xl font-bold text-brand-900 sm:text-3xl">
                {diseaseInfo?.display_name || result.prediction}
              </h1>

              <p className="mt-1 text-xs text-muted">
                Prediction ID: {result.prediction_id}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <Link
                href="/dashboard/detection"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_a_photo</span>
                New Scan
              </Link>
              <Link
                href="/dashboard/history"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>history</span>
                View History
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================
          BODY
      =================================================== */}
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ERROR */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            <span className="mt-0.5 shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold">Something went wrong</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              className="rounded-lg p-1 hover:bg-red-100"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* ─── TOP STATS ─── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Confidence</p>
            <p className="mt-2 text-3xl font-black text-ink">
              {formatConfidence(result.confidence)}
            </p>
            <p className="mt-1 text-xs text-muted">{result.confidence_level}</p>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Severity</p>
            <div className="mt-3">
              <StatusBadge className={getSeverityClass(result.severity)}>
                {result.severity || "Unknown"}
              </StatusBadge>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Risk Level</p>
            <div className="mt-3">
              <StatusBadge className={getRiskClass(diseaseInfo?.risk_level)}>
                {diseaseInfo?.risk_level || "Unknown"}
              </StatusBadge>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Inference Time</p>
            <p className="mt-2 text-2xl font-black text-ink">
              {result.inference_time_ms}
              <span className="ml-1 text-sm font-semibold text-muted">ms</span>
            </p>
          </div>
        </div>

        {/* ─── HIGH / CRITICAL RISK + EMAIL ALERT ─── */}
        {showRiskAlert && (
          <div
            className={`flex items-start gap-3 rounded-2xl border p-5 ${
              isCriticalRisk
                ? "border-red-300 bg-red-50"
                : "border-amber-300 bg-amber-50"
            }`}
          >
            <span
              className={`material-symbols-outlined mt-0.5 shrink-0 ${
                isCriticalRisk ? "text-red-600" : "text-amber-600"
              }`}
              style={{ fontSize: 26 }}
            >
              {isCriticalRisk ? "emergency" : "warning"}
            </span>
            <div className="flex-1">
              <p
                className={`text-[15px] font-bold ${
                  isCriticalRisk ? "text-red-900" : "text-amber-900"
                }`}
              >
                {isCriticalRisk
                  ? "Critical disease detected"
                  : "High-risk disease detected"}
              </p>
              {result.email_sent ? (
                <p
                  className={`mt-1 flex items-center gap-1.5 text-sm ${
                    isCriticalRisk ? "text-red-800" : "text-amber-800"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                    mark_email_read
                  </span>
                  An {isCriticalRisk ? "urgent " : ""}alert has been sent to your
                  registered email.
                </p>
              ) : result.email_queued ? (
                <p
                  className={`mt-1 flex items-center gap-1.5 text-sm ${
                    isCriticalRisk ? "text-red-800" : "text-amber-800"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                    schedule_send
                  </span>
                  An {isCriticalRisk ? "urgent " : ""}alert is being delivered to your
                  registered email.
                </p>
              ) : (
                <p
                  className={`mt-1 flex items-center gap-1.5 text-sm ${
                    isCriticalRisk ? "text-red-800" : "text-amber-800"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                    mail_lock
                  </span>
                  Email alert could not be confirmed for this prediction.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── LOW CONFIDENCE WARNING ─── */}
        {showLowConfidence && result.low_confidence && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-bold text-amber-900">Low-confidence prediction</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  The AI model has lower confidence in this prediction. Consider taking
                  another clear image in good lighting and analysing it again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── IMAGE + DIAGNOSIS ─── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* IMAGE */}
          <section className="overflow-hidden rounded-3xl border border-line bg-white">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-bold text-ink">Analysed Image</h2>
              <p className="mt-0.5 text-xs text-muted">Image submitted for AI analysis.</p>
            </div>
            <div className="flex min-h-[280px] items-center justify-center bg-surface-muted p-4">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Analysed wheat leaf"
                  className="max-h-[420px] w-full rounded-2xl object-contain"
                />
              ) : result.image_url ? (
                <img
                  src={resolveMediaUrl(result.image_url) || ""}
                  alt="Analysed wheat leaf"
                  className="max-h-[420px] w-full rounded-2xl object-contain"
                />
              ) : (
                <div className="text-center text-muted">
                  <div className="text-4xl">🖼️</div>
                  <p className="mt-2 text-sm">Image unavailable</p>
                </div>
              )}
            </div>
          </section>

          {/* DIAGNOSIS */}
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <h2 className="font-bold text-ink">Diagnosis</h2>
            <p className="mt-0.5 mb-4 text-xs text-muted">Primary result from the AI model.</p>

            <div className="rounded-2xl bg-emerald-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {isHealthyPrediction ? "No Disease Detected" : "Disease Detected"}
                </p>
                <StatusBadge className={getRiskClass(diseaseInfo?.risk_level)}>
                  {diseaseInfo?.risk_level || result.severity || "Unknown"}
                </StatusBadge>
              </div>
              <h3 className="mt-2 text-2xl font-black text-emerald-950">
                {diseaseInfo?.display_name || result.prediction}
              </h3>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Confidence</p>
                  {result.low_confidence && (
                    <StatusBadge className="bg-orange-50 text-orange-700 border-orange-100">
                      Low confidence
                    </StatusBadge>
                  )}
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/70">
                  <div
                    className={`h-full rounded-full transition-all ${confTier.barClass}`}
                    style={{ width: `${toConfidencePercent(result.confidence)}%` }}
                  />
                </div>
                <p className={`mt-2 text-sm font-bold ${confTier.textClass}`}>
                  {formatConfidence(result.confidence)}
                  <span className="ml-2 text-[12px] font-semibold">{confTier.label}</span>
                </p>
                {result.low_confidence && (
                  <p className="mt-2 text-xs leading-5 text-orange-700">
                    The model is not certain about this classification. Please
                    capture a clearer wheat-leaf image or consult the detailed
                    result before acting.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-line bg-[#FAFBFA] p-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-brand-600" style={{ fontSize: 20 }}>
                  insured
                </span>
                <p className="text-sm font-bold text-ink">Recommended Action</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                {result.recommendation || "No recommendation was provided."}
              </p>
            </div>
          </section>
        </div>

        {/* ─── TOP PREDICTIONS ─── */}
        {showTop && result.top_predictions?.length > 0 && (
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <h2 className="font-bold text-ink">Top Predictions</h2>
            <p className="mt-0.5 mb-5 text-xs text-muted">Other classes considered by the AI model.</p>

            <div className="space-y-4">
              {result.top_predictions.map((prediction) => {
                const predTier = getConfidenceTier(prediction.confidence, prediction.class_name);
                return (
                <div
                  key={`${prediction.rank}-${prediction.class_name}`}
                  className="rounded-2xl bg-surface-muted p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-black text-muted shadow-sm">
                        #{prediction.rank}
                      </div>
                      <p className="truncate text-sm font-bold text-ink">
                        {prediction.class_name}
                      </p>
                    </div>
                    <p className={`shrink-0 text-sm font-black ${predTier.textClass}`}>
                      {formatConfidence(prediction.confidence)}
                    </p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${predTier.barClass}`}
                      style={{
                        width: `${toConfidencePercent(prediction.confidence)}%`,
                      }}
                    />
                  </div>
                </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── DISEASE INFORMATION ─── */}
        {diseaseInfo && (
          <section>
            <h2 className="mb-4 font-bold text-ink">Disease Information</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-line bg-white p-5">
                <h4 className="font-bold text-ink">Description</h4>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {diseaseInfo.description || "No description available."}
                </p>
              </div>

              <div className="rounded-3xl border border-line bg-white p-5">
                <h4 className="font-bold text-ink">Symptoms</h4>
                {diseaseInfo.symptoms?.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-muted">
                    {diseaseInfo.symptoms.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-red-500">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">No symptoms available.</p>
                )}
              </div>

              <div className="rounded-3xl border border-line bg-white p-5">
                <h4 className="font-bold text-ink">Prevention</h4>
                {diseaseInfo.prevention?.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-muted">
                    {diseaseInfo.prevention.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-emerald-500">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">No prevention information available.</p>
                )}
              </div>

              <div className="rounded-3xl border border-line bg-white p-5">
                <h4 className="font-bold text-ink">Management</h4>
                {diseaseInfo.management?.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-muted">
                    {diseaseInfo.management.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">No management information available.</p>
                )}
              </div>
            </div>

            {diseaseInfo.disclaimer && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                <strong>Disclaimer:</strong> {diseaseInfo.disclaimer}
              </div>
            )}
          </section>
        )}

        {/* ─── GRAD-CAM ─── */}
        {showGradcam && gradcam && (
          <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
            <h2 className="font-bold text-ink">Grad-CAM Visualisation</h2>
            <p className="mt-0.5 mb-5 text-xs text-muted">
              Visual explanation of image regions influencing the model.
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                { title: "Original", url: gradcam.original },
                { title: "Heatmap",  url: gradcam.heatmap  },
                { title: "Overlay",  url: gradcam.overlay  },
              ].map((item) => {
                const url = resolveMediaUrl(item.url);
                return (
                  <div
                    key={item.title}
                    className="overflow-hidden rounded-2xl border border-line bg-surface-muted"
                  >
                    <div className="border-b border-line bg-white px-4 py-3">
                      <p className="text-sm font-bold text-ink">{item.title}</p>
                    </div>
                    <div className="flex aspect-square items-center justify-center bg-surface-muted">
                      {url ? (
                        <img
                          src={url}
                          alt={`Grad-CAM ${item.title}`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <p className="text-sm text-muted">Image unavailable</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── AI REPORT ─── */}
        {showAiReport && (
        <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-bold text-ink">AI Diagnosis Report</h2>
              <p className="mt-0.5 text-xs text-muted">
                Generate a structured explanation and recommendation.
              </p>
            </div>
            {!aiReport && (
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={reportLoading}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-950 disabled:opacity-50"
              >
                {reportLoading ? "Generating…" : "Generate Report"}
              </button>
            )}
          </div>

          {aiReport ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-surface-muted p-5 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Report Title</p>
                <h4 className="mt-2 text-xl font-bold text-ink">{aiReport.title}</h4>
                {aiReport.generated_by && (
                  <p className="mt-1 text-xs text-muted">Generated by {aiReport.generated_by}</p>
                )}
              </div>

              <div className="rounded-2xl border border-line p-5">
                <h4 className="font-bold text-ink">Problem</h4>
                <p className="mt-2 text-sm leading-6 text-muted">{aiReport.problem}</p>
              </div>

              <div className="rounded-2xl border border-line p-5">
                <h4 className="font-bold text-ink">Recommendation</h4>
                <p className="mt-2 text-sm leading-6 text-muted">{aiReport.recommendation}</p>
              </div>

              <div className="rounded-2xl border border-line p-5 md:col-span-2">
                <h4 className="font-bold text-ink">Solution</h4>
                <p className="mt-2 text-sm leading-6 text-muted">{aiReport.solution}</p>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-line bg-surface-muted p-6 text-center">
              <p className="text-sm text-muted">
                Generate the AI diagnosis report to receive a structured explanation,
                recommendation and solution.
              </p>
            </div>
          )}
        </section>
        )}

        {/* ─── MODEL INFO ─── */}
        <section className="rounded-3xl border border-line bg-surface-muted p-5">
          <h2 className="mb-4 font-bold text-ink">Model Information</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs text-muted">Model Version</p>
              <p className="mt-1 text-sm font-bold text-ink">{result.model_version || "Unknown"}</p>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs text-muted">Confidence Level</p>
              <p className="mt-1 text-sm font-bold text-ink">{result.confidence_level || "Unknown"}</p>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs text-muted">Grad-CAM</p>
              <p className="mt-1 text-sm font-bold text-ink">
                {result.gradcam_available ? "Available" : "Unavailable"}
              </p>
            </div>
          </div>
        </section>

        {/* ─── ACTIONS ─── */}
        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/dashboard/detection"
            className="inline-flex items-center justify-center rounded-xl border border-line bg-white px-5 py-3 text-sm font-bold text-ink transition hover:bg-surface-muted"
          >
            ← Back to Detection
          </Link>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportImage}
              disabled={exportLoading !== null}
              className="rounded-xl border border-line bg-white px-4 py-3 text-sm font-bold text-ink transition hover:bg-surface-muted disabled:opacity-50"
            >
              {exportLoading === "image" ? "Exporting…" : "🖼️ Export Image"}
            </button>

            <button
              type="button"
              onClick={handleExportPptx}
              disabled={exportLoading !== null}
              className="rounded-xl border border-line bg-white px-4 py-3 text-sm font-bold text-ink transition hover:bg-surface-muted disabled:opacity-50"
            >
              {exportLoading === "pptx" ? "Exporting…" : "📊 Export PPTX"}
            </button>

            <Link
              href="/dashboard/detection"
              className="rounded-xl bg-brand-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-950"
            >
              📷 New Scan
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
