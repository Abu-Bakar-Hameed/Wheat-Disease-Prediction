"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { useApp } from "@/lib/appState";
import { useToast, SelectMenu } from "@/components/wg/ui";
import { useScrollLock } from "@/lib/useScrollLock";

import {
  fetchHistory,
  getCachedUserSettings,
  deleteHistoryItem,
  regenerateDiagnosisReport,
  generateSinglePptx,
  generateSingleImage,
  recordActivityEvent,
  createShareLink,
  disableShareLink,
  type HistoryItem,
  type AiDiagnosisReport,
  type PredictionResponse,
} from "@/lib/api";

import {
  downloadBlob,
  sanitiseFilename,
} from "@/lib/download";

import { generatePredictionPdf } from "@/lib/generatePdf";
import { resolveAiReport } from "@/lib/diagnosisReport";
import { formatConfidence, getConfidenceTier } from "@/lib/confidence";
import {
  formatDate as fmtDateSettings,
  formatTime as fmtTimeSettings,
  formatDateTime as fmtDateTimeSettings,
} from "@/lib/settingsFormat";

/* ============================================================================
   HELPERS
============================================================================ */

const PINNED_STORAGE_KEY = "wheatguard_pinned_predictions";

/* Confidence colours come from the shared tier system (lib/confidence).
   Red is reserved for disease severity — low confidence renders as orange. */
function confidenceBarClass(confidence: number, disease?: string | null) {
  return getConfidenceTier(confidence, disease).barClass;
}

function formatDisease(value: unknown) {
  const text = String(value ?? "Unknown").replace(/_/g, " ").trim();
  if (!text) return "Unknown";

  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(value: unknown) {
  if (!value) return "—";
  return fmtDateSettings(String(value), getCachedUserSettings()) || "—";
}

function formatTime(value: unknown) {
  if (!value) return "—";
  return fmtTimeSettings(String(value), getCachedUserSettings()) || "—";
}

function formatDateTime(value: unknown) {
  if (!value) return "—";
  return fmtDateTimeSettings(String(value), getCachedUserSettings()) || "—";
}

/** Normalises string | string[] | null into readable text. */
function toText(value: unknown, fallback = "") {
  if (Array.isArray(value)) {
    const joined = value.filter(Boolean).map(String).join(" | ").trim();
    return joined || fallback;
  }

  const text = String(value ?? "").trim();
  return text || fallback;
}

/** Returns a 0–1 confidence value regardless of whether the API sent
 *  a fraction (0.94) or a percentage (94). */
function getConfidence(item: HistoryItem): number {
  const raw =
    (item as any)?.confidence ??
    (item as any)?.confidence_score ??
    (item as any)?.confidence_pct ??
    (item as any)?.confidence_percentage ??
    0;

  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;

  return value > 1 ? Math.min(value / 100, 1) : Math.max(0, Math.min(value, 1));
}

function getPredictionId(item: HistoryItem): string {
  return String((item as any)?.prediction_id ?? (item as any)?.id ?? "");
}

function getDisease(item: HistoryItem): string {
  return String(
    (item as any)?.predicted_class ??
      (item as any)?.prediction ??
      (item as any)?.disease ??
      (item as any)?.disease_name ??
      "Unknown"
  );
}

function getCreatedAt(item: HistoryItem): string {
  return String(
    (item as any)?.created_at ??
      (item as any)?.date_created ??
      (item as any)?.date ??
      (item as any)?.timestamp ??
      ""
  );
}

function getFilename(item: HistoryItem): string {
  return String(
    (item as any)?.filename ??
      (item as any)?.file_name ??
      (item as any)?.image_name ??
      "Wheat Leaf"
  );
}

function getSeverity(item: HistoryItem): string {
  return String((item as any)?.severity ?? (item as any)?.severity_level ?? "—");
}

/** Resolves whatever shape of image reference the backend sends into an
 *  absolute, browser-loadable URL. */
function getImageUrl(item: HistoryItem): string {
  const raw = String(
    (item as any)?.image_url ??
      (item as any)?.imageUrl ??
      (item as any)?.original_image_url ??
      (item as any)?.image_path ??
      (item as any)?.file_url ??
      ""
  ).trim();

  if (!raw) return "";

  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }

  if (raw.startsWith("/_next/") || raw.startsWith("/images/")) {
    return raw;
  }

  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
}

/* ============================================================================
   HISTORY ITEM -> PREDICTION RESPONSE
============================================================================ */

function historyItemToPrediction(item: HistoryItem): PredictionResponse {
  const disease = getDisease(item);
  const confidence = getConfidence(item);
  const predictionId = getPredictionId(item);
  const raw = item as any;

  const topPredictions = Array.isArray(raw.top_predictions)
    ? raw.top_predictions
    : [
        {
          rank: 1,
          class_name: disease,
          confidence,
          confidence_percentage: confidence * 100,
        },
      ];

  return {
    prediction_id: predictionId,
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
      disclaimer:
        raw.disclaimer ??
        "AI prediction only. Always consult a qualified agricultural expert before treatment.",
    },

    recommendation: raw.recommendation ?? raw.ai_recommendation ?? "",
    gradcam: raw.gradcam ?? raw.gradcam_url ?? null,
    gradcam_available: Boolean(raw.gradcam_available ?? raw.gradcam ?? raw.gradcam_url),
    inference_time_ms: Number(raw.inference_time_ms ?? raw.inference_time ?? 0),
    model_version: raw.model_version ?? "—",
    image_url: getImageUrl(item) || undefined,
    ai_report: raw.ai_report ?? raw.diagnosis_report ?? null,
  } as PredictionResponse;
}

/* ============================================================================
   THUMBNAIL
============================================================================ */

function HistoryThumbnail({ item, large = false }: { item: HistoryItem; large?: boolean }) {
  const [failed, setFailed] = useState(false);

  const imageUrl = getImageUrl(item);
  const disease = getDisease(item);
  const healthy = disease.toLowerCase().includes("healthy");

  const size = large ? "w-full h-full" : "h-12 w-12";

  if (imageUrl && !failed) {
    return (
      <div className={`${size} shrink-0 overflow-hidden rounded-xl border border-line bg-surface-muted`}>
        <img
          src={imageUrl}
          alt={`${formatDisease(disease)} leaf`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-xl ${
        healthy ? "bg-brand-50 dark:bg-brand-900/40" : "bg-danger-soft"
      }`}
    >
      <span
        className={`material-symbols-outlined ${healthy ? "text-brand-700 dark:text-brand-300" : "text-danger"}`}
        style={{ fontSize: large ? 42 : 21 }}
      >
        {healthy ? "eco" : "coronavirus"}
      </span>
    </div>
  );
}

/* ============================================================================
   CONFIRM DELETE MODAL
============================================================================ */

function ConfirmModal({
  item,
  loading,
  onCancel,
  onConfirm,
}: {
  item: HistoryItem | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Keep the page behind the dialog from scrolling.
  const lockRef = useScrollLock();

  if (!item) return null;

  return (
    <div ref={lockRef} className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !loading && onCancel()}
        className="absolute inset-0"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-soft">
              <span className="material-symbols-outlined text-danger" style={{ fontSize: 22 }}>
                delete
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-ink">Delete prediction?</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                This will permanently remove this prediction record. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-surface-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Prediction
            </p>
            <p className="mt-1 text-xs font-semibold text-ink">
              {formatDisease(getDisease(item))}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-line bg-surface-muted px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-xs font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && (
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 17 }}>
                progress_activity
              </span>
            )}
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   EXPORT MODAL  (this is the ONLY place a file gets downloaded)
============================================================================ */

type ExportFormat = "pdf" | "pptx" | "image";

const EXPORT_FORMATS: {
  id: ExportFormat;
  label: string;
  hint: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}[] = [
  { id: "pdf", label: "PDF Report", hint: "A4 professional report", icon: "picture_as_pdf", iconBg: "bg-danger-soft", iconColor: "text-danger" },
  { id: "pptx", label: "PowerPoint", hint: "Editable presentation", icon: "slideshow", iconBg: "bg-orange-50", iconColor: "text-orange-600" },
  { id: "image", label: "Image", hint: "PNG report image", icon: "image", iconBg: "bg-blue-50", iconColor: "text-blue-600" },
];

function HistoryExportModal({ item, onClose }: { item: HistoryItem | null; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Keep the page behind the dialog from scrolling.
  const lockRef = useScrollLock();

  if (!item) return null;

  const disease = getDisease(item);
  const confidence = getConfidence(item);
  const predictionId = getPredictionId(item);

  const handleDownload = async () => {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const datePart = new Date().toISOString().slice(0, 10);
      const baseName = sanitiseFilename(
        "WheatGuard",
        disease.slice(0, 24),
        predictionId.slice(0, 8),
        datePart
      );

      if (format === "pdf") {
        const result = historyItemToPrediction(item);
        await generatePredictionPdf(result);
        onClose();
        return;
      }

      if (!predictionId) {
        throw new Error("This history record does not have a valid prediction ID.");
      }

      if (format === "pptx") {
        const blob = await generateSinglePptx(predictionId);
        downloadBlob(blob, `${baseName}_report.pptx`);
        onClose();
        return;
      }

      if (format === "image") {
        const blob = await generateSingleImage(predictionId);
        downloadBlob(blob, `${baseName}_report.png`);
        onClose();
        return;
      }
    } catch (err) {
      console.error("History export failed:", err);
      setError(err instanceof Error ? err.message : "Report generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={lockRef} className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !loading && onClose()}
        className="absolute inset-0"
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-700 dark:text-brand-300" style={{ fontSize: 24 }}>
                download
              </span>
              <h2 className="text-lg font-bold text-ink">Download Report</h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              Choose the format for this diagnostic record.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-muted hover:text-ink disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 21 }}>close</span>
          </button>
        </div>

        {/* Record preview */}
        <div className="px-6 pt-5">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-muted p-4">
            <HistoryThumbnail item={item} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-ink">
                {formatDisease(disease)}
              </div>
              <div className="text-xs text-muted">
                Confidence: {(confidence * 100).toFixed(1)}% • {formatDate(getCreatedAt(item))}
              </div>
            </div>
          </div>
        </div>

        {/* Formats */}
        <div className="p-6">
          <div className="mb-3 text-xs font-semibold text-ink">Select Download Format</div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {EXPORT_FORMATS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setFormat(option.id);
                  setError("");
                }}
                className={`rounded-xl border p-4 text-left transition-all ${
                  format === option.id
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900/40 ring-1 ring-brand-500"
                    : "border-line bg-surface hover:border-brand-300 dark:border-brand-700 hover:bg-surface-muted"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${option.iconBg}`}>
                  <span className={`material-symbols-outlined ${option.iconColor}`} style={{ fontSize: 22 }}>
                    {option.icon}
                  </span>
                </div>

                <div className="mt-2.5 text-xs font-bold text-ink">{option.label}</div>
                <div className="mt-0.5 text-xs text-muted">{option.hint}</div>
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-danger" style={{ fontSize: 18 }}>error</span>
                <p className="text-xs text-danger">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-line bg-surface-muted px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-xs font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`}
              style={{ fontSize: 18 }}
            >
              {loading ? "progress_activity" : "download"}
            </span>
            {loading ? "Generating..." : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   SHARE MODAL  (link sharing — WhatsApp / Facebook / Copy Link / native sheet)
============================================================================ */

function ShareModal({ item, onClose }: { item: HistoryItem | null; onClose: () => void }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revoking, setRevoking] = useState(false);
  // Inline "copied" feedback on the URL-row icon, so the click is acknowledged
  // right where the user pressed instead of only via a toast + auto-close.
  const [linkCopied, setLinkCopied] = useState(false);

  // Secure share link: the backend mints a random token unrelated to the
  // prediction UUID when the modal opens (idempotent — an existing token is
  // reused so older links keep working). State is keyed by prediction id so
  // switching records can never show the wrong link (§21). setState runs
  // only after an await, keeping the effect free of synchronous cascades.
  const [shareState, setShareState] = useState<{ id: string; token: string } | null>(null);
  const [shareFailure, setShareFailure] = useState<{ id: string; message: string } | null>(null);

  const predictionId = item ? getPredictionId(item) : "";

  useEffect(() => {
    if (!predictionId) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await createShareLink(predictionId);
        if (!cancelled) {
          setShareState({ id: predictionId, token: result.share_token });
          setShareFailure(null);
        }
      } catch (err) {
        if (!cancelled) {
          setShareFailure({
            id: predictionId,
            message:
              err instanceof Error && err.message
                ? err.message
                : "Unable to create the share link right now. Please try again.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [predictionId]);

  // The menu closes on selection, outside click (backdrop) or Escape.
  useEffect(() => {
    if (!item) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  // Keep the page behind the dialog from scrolling.
  const lockRef = useScrollLock();

  if (!item) return null;

  const rawDisease = getDisease(item);
  const diseaseLabel = formatDisease(rawDisease);
  const healthy = rawDisease.toLowerCase().includes("healthy");
  const confidence = getConfidence(item);
  const severity = getSeverity(item);
  const severityLabel = severity
    ? severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase()
    : severity;
  // Same stored values the result & history pages render, formatted through
  // the shared confidence lib — the shared number can never drift.
  const confidencePct = formatConfidence(confidence);

  const rawItem = item as {
    ai_report?: AiDiagnosisReport | null;
    top_predictions?: {
      class_name?: string;
      confidence?: number;
      confidence_percentage?: number;
    }[];
  };
  const problemLine = String(rawItem.ai_report?.problem ?? "").trim();
  const topFirst = Array.isArray(rawItem.top_predictions) ? rawItem.top_predictions[0] : undefined;
  const topLabel = topFirst?.class_name
    ? formatDisease(String(topFirst.class_name))
    : diseaseLabel;
  const topPct =
    typeof topFirst?.confidence_percentage === "number"
      ? `${topFirst.confidence_percentage.toFixed(1)}%`
      : confidencePct;

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const shareToken = shareState?.id === predictionId ? shareState.token : null;
  const linkFailure = shareFailure?.id === predictionId ? shareFailure.message : "";
  const linkPending = Boolean(predictionId) && !shareToken && !linkFailure;

  /** Tokenized public URL — never the private prediction UUID, never the
   *  homepage. NEXT_PUBLIC_SITE_URL lets a deployed build share its real
   *  domain; falls back to the current origin so nothing is hardcoded. */
  const shareUrl = shareToken
    ? `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/share/${shareToken}`
    : "";

  /** Concise summary — the complete report lives on the linked page. */
  const shareSummary = (url: string) =>
    healthy
      ? `🌾 WheatGuard AI Diagnosis\n\nResult: Healthy\nAI Confidence: ${confidencePct}\n\nView the complete AI Diagnosis Report:\n${url}`
      : `🌾 WheatGuard AI Diagnosis\n\nDisease: ${diseaseLabel}\nSeverity: ${severityLabel}\nAI Confidence: ${confidencePct}\n\nTop Prediction:\n${topLabel} — ${topPct}\n\nView the complete AI Diagnosis Report:\n${url}`;

  /** Clipboard write with a legacy fallback for browsers/contexts where
   *  the async Clipboard API is unavailable (http, older engines). */
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to the legacy path below
    }

    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  };

  /** All channels point at the SAME secure tokenized URL — refuse to open
   *  anything while the link is still being prepared (never a partial share). */
  const requireLink = (): boolean => {
    if (shareUrl) {
      setError("");
      return true;
    }
    setError(
      linkPending
        ? "Preparing your secure link… please try again in a second."
        : linkFailure || "Share link is not available yet."
    );
    return false;
  };

  const handleCopyLink = () => {
    setNotice("");
    if (!requireLink()) return;

    void copyToClipboard(shareUrl).then((ok) => {
      if (ok) {
        setNotice("Link copied!");
        window.setTimeout(onClose, 1000);
      } else {
        setError("Unable to copy automatically. Please copy the link manually.");
      }
    });
  };

  /** Copy straight from the URL row: acknowledge it on the button itself
   *  (icon morphs to a check) and keep the modal open so sharing can continue. */
  const handleCopyUrlInline = () => {
    setNotice("");
    if (!requireLink()) return;

    void copyToClipboard(shareUrl).then((ok) => {
      if (ok) {
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1800);
      } else {
        setError("Unable to copy automatically. Please copy the link manually.");
      }
    });
  };

  const handleWhatsApp = () => {
    setNotice("");
    if (!requireLink()) return;

    // window.open fires synchronously inside the click handler so the
    // browser sees a genuine user gesture (no popup blocking).
    const opened = window.open(
      `https://wa.me/?text=${encodeURIComponent(shareSummary(shareUrl))}`,
      "_blank",
      "noopener,noreferrer"
    );

    if (!opened) {
      void copyToClipboard(shareUrl).then((ok) =>
        setNotice(
          ok
            ? "Unable to open WhatsApp. The prediction link has been copied instead."
            : "Unable to open WhatsApp. Please copy the prediction link manually."
        )
      );
      return;
    }

    onClose();
  };

  const handleFacebook = () => {
    setNotice("");
    if (!requireLink()) return;

    // Facebook's sharer accepts a URL only — the share page's Open Graph
    // tags supply the preview, so no prediction text goes into this URL.
    const opened = window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "noopener,noreferrer"
    );

    if (!opened) {
      setError("Unable to open Facebook sharing. Please use Copy Link instead.");
      return;
    }

    onClose();
  };

  const handleNativeShare = () => {
    setNotice("");
    if (!requireLink()) return;

    navigator
      .share({
        title: `WheatGuard AI Diagnosis — ${diseaseLabel}`,
        text: `AI Confidence: ${confidencePct}\nSeverity: ${severityLabel}`,
        url: shareUrl,
      })
      .then(() => onClose())
      .catch((shareError: unknown) => {
        // Person dismissed the share sheet — not an error worth showing.
        if ((shareError as { name?: string })?.name === "AbortError") return;
        console.error("Native share failed:", shareError);
        setError("Sharing was interrupted. Please use Copy Link instead.");
      });
  };

  const handleEmail = () => {
    setNotice("");
    if (!requireLink()) return;

    const subject = `WheatGuard AI Diagnosis — ${diseaseLabel}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareSummary(shareUrl))}`;
    setNotice("Your email app should open with the diagnosis summary.");
  };

  const handleTelegram = () => {
    setNotice("");
    if (!requireLink()) return;

    const opened = window.open(
      `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareSummary(shareUrl))}`,
      "_blank",
      "noopener,noreferrer"
    );

    if (!opened) {
      setError("Unable to open Telegram. Please use Copy Link instead.");
      return;
    }
    onClose();
  };

  const handleTwitter = () => {
    setNotice("");
    if (!requireLink()) return;

    const opened = window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(`WheatGuard AI Diagnosis — ${diseaseLabel} (${confidencePct})`)}&url=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "noopener,noreferrer"
    );

    if (!opened) {
      setError("Unable to open X/Twitter. Please use Copy Link instead.");
      return;
    }
    onClose();
  };

  const handleRevoke = () => {
    if (!shareToken || revoking) return;
    setRevoking(true);
    setError("");
    setNotice("");

    void disableShareLink(predictionId)
      .then(() => {
        setShareState(null);
        setShareFailure({
          id: predictionId,
          message: "Sharing is turned off — the old link no longer opens this prediction.",
        });
      })
      .catch(() => setError("Unable to disable sharing. Please try again."))
      .finally(() => setRevoking(false));
  };

  const shareOptions = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      hint: "Summary + full report link",
      icon: "chat",
      iconBg: "bg-brand-50 dark:bg-brand-900/40",
      iconColor: "text-brand-700 dark:text-brand-300",
      onSelect: handleWhatsApp,
    },
    {
      id: "facebook",
      label: "Facebook",
      hint: "Share dialog with live preview",
      icon: "public",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      onSelect: handleFacebook,
    },
    {
      id: "copy",
      label: "Copy Link",
      hint: "Copy the secure report URL",
      icon: "link",
      iconBg: "bg-surface-muted",
      iconColor: "text-ink",
      onSelect: handleCopyLink,
    },
    {
      id: "email",
      label: "Email",
      hint: "Summary + link in your mail app",
      icon: "mail",
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
      onSelect: handleEmail,
    },
    {
      id: "telegram",
      label: "Telegram",
      hint: "Share the report on Telegram",
      icon: "send",
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
      onSelect: handleTelegram,
    },
    {
      id: "twitter",
      label: "X / Twitter",
      hint: "Post with the report link",
      icon: "tag",
      iconBg: "bg-surface-muted",
      iconColor: "text-ink",
      onSelect: handleTwitter,
    },
    // Only offered on devices that actually implement navigator.share —
    // never show a broken native-share button.
    ...(canNativeShare
      ? [
          {
            id: "more",
            label: "More sharing options",
            hint: "Open your device's share sheet",
            icon: "ios_share",
            iconBg: "bg-brand-50 dark:bg-brand-900/40",
            iconColor: "text-brand-700 dark:text-brand-300",
            onSelect: handleNativeShare,
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-700 dark:text-brand-300" style={{ fontSize: 24 }}>
                share
              </span>
              <h2 className="text-lg font-bold text-ink">Share Prediction</h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              Share the complete AI diagnosis report — WhatsApp, Facebook, Email or copy.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-muted hover:text-ink"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 21 }}>close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Report preview card */}
        <div className="px-6 pt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Preview
          </div>
          <div className="rounded-xl border border-line bg-surface-muted p-4">
            <div className="flex items-center gap-3">
              <HistoryThumbnail item={item} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink">
                  {healthy ? "Healthy" : diseaseLabel}
                </div>
                <div className="text-xs text-muted">
                  AI Confidence: {confidencePct}
                  {!healthy && ` • Severity: ${severityLabel}`}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted">
              <span className="rounded-full bg-surface px-2.5 py-1 font-semibold text-ink">
                Top: {topLabel} — {topPct}
              </span>
              <span className="rounded-full bg-surface px-2.5 py-1 font-semibold text-ink">
                {formatDate(getCreatedAt(item))}
              </span>
            </div>
            {problemLine && (
              <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink">
                {problemLine}
              </p>
            )}
          </div>
        </div>

        {/* Secure share URL */}
        {!predictionId ? (
          <div className="px-6 pt-4">
            <div className="rounded-xl border border-warning/30 bg-warning-soft dark:bg-warning/10 px-4 py-3 text-xs leading-relaxed text-warning">
              This record has no valid prediction ID yet, so it can&apos;t be
              shared. Use the Export option for a file report instead.
            </div>
          </div>
        ) : shareUrl ? (
          <div className="px-6 pt-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Share URL
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-line bg-surface-muted px-2.5 py-1.5 focus-within:border-brand-400 dark:focus-within:border-brand-600">
              <span className="material-symbols-outlined shrink-0 pl-1 text-muted" style={{ fontSize: 18 }}>
                link
              </span>
              <input
                readOnly
                value={shareUrl}
                aria-label="Share URL"
                onFocus={(event) => event.target.select()}
                className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs text-ink outline-none"
              />
              <button
                type="button"
                onClick={handleCopyUrlInline}
                aria-label={linkCopied ? "Link copied to clipboard" : "Copy share URL"}
                title={linkCopied ? "Copied!" : "Copy link"}
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20 ${
                  linkCopied
                    ? "bg-success-soft text-success"
                    : "text-muted hover:bg-surface hover:text-brand-700 dark:hover:text-brand-300 active:scale-95"
                }`}
              >
                <span
                  key={linkCopied ? "copied" : "copy"}
                  className="material-symbols-outlined animate-scale-in"
                  style={{ fontSize: 18 }}
                >
                  {linkCopied ? "check" : "content_copy"}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 pt-4">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-muted px-4 py-3 text-xs font-medium text-muted">
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>
                progress_activity
              </span>
              {linkPending
                ? "Preparing your secure share link…"
                : "Share link unavailable."}
            </div>
          </div>
        )}

        {/* Share options — every channel points at the same secure URL */}
        <div className="p-6 pt-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shareOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={option.onSelect}
                disabled={linkPending || Boolean(linkFailure) || !shareUrl}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-brand-400 dark:border-brand-600 hover:bg-brand-50/60 dark:bg-brand-900/30 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${option.iconBg}`}
                >
                  <span
                    className={`material-symbols-outlined ${option.iconColor}`}
                    style={{ fontSize: 22 }}
                  >
                    {option.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink">
                    {option.label}
                  </div>
                  <div className="text-xs text-muted">{option.hint}</div>
                </div>
              </button>
            ))}
          </div>

          {notice && (
            <div className="mt-4 rounded-xl border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/40 px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-brand-700 dark:text-brand-300" style={{ fontSize: 18 }}>
                  check_circle
                </span>
                <p className="text-xs text-brand-900 dark:text-brand-200">{notice}</p>
              </div>
            </div>
          )}

          {(error || linkFailure) && (
            <div className="mt-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-danger" style={{ fontSize: 18 }}>error</span>
                <p className="text-xs text-danger">{error || linkFailure}</p>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-6 py-4">
          <button
            type="button"
            onClick={handleRevoke}
            disabled={!shareToken || revoking}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span
              className={`material-symbols-outlined ${revoking ? "animate-spin" : ""}`}
              style={{ fontSize: 17 }}
            >
              {revoking ? "progress_activity" : "link_off"}
            </span>
            {revoking ? "Turning off…" : "Stop sharing"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-xs font-semibold text-ink transition hover:bg-surface-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   DETAIL MODAL
============================================================================ */

/** Maps a free-text severity string to a colored badge + icon. */
function severityBadgeClass(severity: string) {
  const value = severity.toLowerCase();

  if (value.includes("critical") || value.includes("severe") || value.includes("high")) {
    return "bg-danger-soft text-danger border-danger/20";
  }

  if (value.includes("moderate") || value.includes("medium")) {
    return "bg-warning-soft dark:bg-warning/10 text-warning border-warning/25";
  }

  if (value.includes("low") || value.includes("mild") || value.includes("healthy")) {
    return "bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300 border-brand-200 dark:border-brand-800";
  }

  return "bg-surface-muted text-ink border-line";
}

function severityIcon(severity: string) {
  const value = severity.toLowerCase();

  if (value.includes("critical") || value.includes("severe") || value.includes("high")) {
    return "error";
  }

  if (value.includes("moderate") || value.includes("medium")) {
    return "warning";
  }

  if (value.includes("low") || value.includes("mild") || value.includes("healthy")) {
    return "check_circle";
  }

  return "info";
}

/** Short, tier-based note explaining what the confidence score means. */
function confidenceNote(confidence: number) {
  if (confidence >= 0.8) {
    return "The AI model is highly confident in this diagnosis.";
  }

  if (confidence >= 0.5) {
    return "The AI model has moderate confidence in this diagnosis. Consider a second opinion for critical decisions.";
  }

  return "The AI model is less certain about this diagnosis. Please review field conditions and expert guidance.";
}

/** Circular confidence gauge (SVG ring) with the percentage centered. */
function ConfidenceRing({ confidence, disease }: { confidence: number; disease?: string | null }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(confidence, 0), 1);
  const offset = circumference * (1 - progress);
  const tier = getConfidenceTier(confidence, disease);

  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90">
        <circle cx="50" cy="50" r={radius} strokeWidth="7" className="fill-none stroke-emerald-50" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          strokeWidth="7"
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
        <span className="mt-1.5 text-xs font-medium text-muted">Confidence</span>
      </div>
    </div>
  );
}

/** Boxed section: icon tile + title, hairline divider, body copy. */
function InfoPanel({
  icon,
  title,
  tone,
  children,
}: {
  icon: string;
  title: string;
  tone: "problem" | "recommendation" | "solution";
  children: React.ReactNode;
}) {
  const tones = {
    problem: { border: "border-danger/20", tile: "bg-danger-soft", icon: "text-red-500" },
    recommendation: { border: "border-warning/25", tile: "bg-warning-soft dark:bg-warning/10", icon: "text-amber-500" },
    solution: { border: "border-brand-200 dark:border-brand-800", tile: "bg-brand-50 dark:bg-brand-900/40", icon: "text-brand-700 dark:text-brand-300" },
  }[tone];

  return (
    <div className={`rounded-2xl border ${tones.border} bg-surface p-5`}>
      <div className="flex items-center gap-3 pb-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones.tile}`}>
          <span className={`material-symbols-outlined ${tones.icon}`} style={{ fontSize: 22 }}>
            {icon}
          </span>
        </div>
        <h4 className="text-base font-bold text-ink">{title}</h4>
      </div>

      <div className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
        {children}
      </div>
    </div>
  );
}

function DetailModal({
  item,
  onClose,
  onExport,
  onShare,
  onRegenerated,
}: {
  item: HistoryItem | null;
  onClose: () => void;
  onExport: () => void;
  onShare: () => void;
  onRegenerated: (item: HistoryItem) => void;
}) {
  const [regenerating, setRegenerating] = useState(false);
  const [report, setReport] = useState<AiDiagnosisReport | null>(null);
  const [reportError, setReportError] = useState("");
  // Keep the page behind the dialog from scrolling (the overlay itself is the
  // scroll container here, and it is skipped by the lock's ancestor walk).
  const lockRef = useScrollLock();

  useEffect(() => {
    if (!item) {
      setReport(null);
      setReportError("");
      return;
    }

    const raw = item as any;
    const existing = raw.ai_report ?? raw.diagnosis_report ?? null;
    const disease = getDisease(item);
    const confidence = getConfidence(item);
    const recommendation = item.recommendation ?? "";
    setReport(existing ? resolveAiReport(existing, disease, confidence * 100, recommendation) : null);
    setReportError("");
  }, [item]);

  if (!item) {
    return null;
  }

  const disease = getDisease(item);
  const confidence = getConfidence(item);
  const severity = getSeverity(item);
  const imageUrl = getImageUrl(item);

  const raw = item as any;
  const ai = (report ?? {}) as any;

  const scientificName: string =
    raw.scientific_name ?? raw.disease_info?.scientific_name ?? raw.latin_name ?? "";

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
      ? "border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300"
      : confidence >= 0.5
        ? "border-warning/25 bg-warning-soft dark:bg-warning/10 text-warning"
        : "border-danger/20 bg-danger-soft text-danger";

  const handleRegenerate = async () => {
    const predictionId = getPredictionId(item);

    if (!predictionId) {
      setReportError("Prediction ID is missing.");
      return;
    }

    setRegenerating(true);
    setReportError("");

    try {
      const result = await regenerateDiagnosisReport(predictionId);

      const generated = (result as any)?.ai_report ?? (result as any)?.report ?? result;

      setReport(resolveAiReport(generated, disease, confidence * 100, recommendation));

      onRegenerated({
        ...item,
        ...(result as any),
      } as HistoryItem);
    } catch (err) {
      console.error("AI report regeneration failed:", err);
      setReportError(err instanceof Error ? err.message : "Unable to regenerate AI report.");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div ref={lockRef} className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-[28px] bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-7 pb-5 pt-7">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-900/40">
              <span className="material-symbols-outlined text-brand-700 dark:text-brand-300" style={{ fontSize: 26 }}>
                eco
              </span>
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-300">
                Diagnostic Record
              </p>

              <h2 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-ink">
                {formatDisease(disease)}
              </h2>

              <p className="mt-1.5 text-sm text-muted">
                {formatDateTime(getCreatedAt(item))}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-muted hover:text-ink"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 26 }}>
              close
            </span>
          </button>
        </div>

        <div className="space-y-5 px-7 pb-7">
          {/* Image + AI prediction */}
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
                    <span className="material-symbols-outlined text-6xl text-slate-300">image</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 px-3 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                  <span className="material-symbols-outlined text-muted" style={{ fontSize: 20 }}>
                    image
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted">Original file</p>
                  <p className="truncate text-sm font-semibold text-ink">
                    {getFilename(item)}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Prediction card */}
            <div className="rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center rounded-lg bg-brand-50 dark:bg-brand-900/40 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-brand-800 dark:text-brand-300">
                  AI Prediction
                </span>

                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                    Severity
                  </p>

                  <span
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold capitalize ${severityBadgeClass(
                      severity
                    )}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {severityIcon(severity)}
                    </span>
                    {severity}
                  </span>
                </div>
              </div>

              <h3 className="mt-4 text-[26px] font-bold leading-tight text-ink">
                {formatDisease(disease)}
              </h3>

              {scientificName && (
                <p className="mt-1 text-sm italic text-muted">({scientificName})</p>
              )}

              <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
                <ConfidenceRing confidence={confidence} disease={disease} />

                <div className="w-full flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-ink">AI Confidence</p>

                    <span
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold ${confidenceBadge}`}
                    >
                      {confidenceLevel}
                    </span>
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${confidenceBarClass(
                        confidence,
                        disease
                      )}`}
                      style={{ width: `${Math.min(Math.max(confidence * 100, 0), 100)}%` }}
                    />
                  </div>

                  <p className={`mt-2 text-xs font-semibold ${getConfidenceTier(confidence, disease).textClass}`}>
                    {getConfidenceTier(confidence, disease).label}
                  </p>

                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    {confidenceNote(confidence)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Problem / Recommendation / Solution */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <InfoPanel icon="coronavirus" title="Problem" tone="problem">
              {problem}
            </InfoPanel>

            <InfoPanel icon="lightbulb" title="Recommendation" tone="recommendation">
              {recommendation}
            </InfoPanel>

            <InfoPanel icon="check_circle" title="Solution" tone="solution">
              {solution}
            </InfoPanel>
          </div>

          {reportError && (
            <div className="rounded-xl border border-danger/20 bg-danger-soft p-3 text-xs text-danger">
              {reportError}
            </div>
          )}

          {/* Regenerate report — last, after Problem / Recommendation / Solution */}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-brand-300 dark:border-brand-700 bg-surface py-4 text-sm font-bold text-brand-800 dark:text-brand-300 transition hover:bg-brand-50 dark:bg-brand-900/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              className={`material-symbols-outlined text-2xl ${regenerating ? "animate-spin" : ""}`}
            >
              {regenerating ? "progress_activity" : "refresh"}
            </span>
            {regenerating ? "Regenerating..." : "Regenerate Report"}
          </button>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-line bg-surface px-7 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line bg-surface px-7 py-3 text-sm font-semibold text-ink transition hover:bg-surface-muted"
          >
            Close
          </button>

          <button
            type="button"
            onClick={onShare}
            className="flex items-center justify-center gap-2 rounded-xl border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/40 px-6 py-3 text-sm font-semibold text-brand-800 dark:text-brand-300 transition hover:bg-brand-100 dark:bg-brand-900/50"
          >
            <span className="material-symbols-outlined text-xl">share</span>
            Share
          </button>

          <button
            type="button"
            onClick={onExport}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <span className="material-symbols-outlined text-xl">download</span>
            Download Report
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   MAIN HISTORY VIEW
============================================================================ */

const FILTER_OPTIONS = [
  { value: "all", label: "All Results" },
  { value: "pinned", label: "Pinned" },
  { value: "disease", label: "Diseases" },
  { value: "healthy", label: "Healthy" },
  { value: "high", label: "High Confidence" },
  { value: "medium", label: "Medium Confidence" },
  { value: "low", label: "Low Confidence" },
];

export function HistoryView() {
  const router = useRouter();
  const { setDiagnosticTab, setLastResult } = useApp();
  const toast = useToast();

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const [exportItem, setExportItem] = useState<HistoryItem | null>(null);
  const [shareItem, setShareItem] = useState<HistoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Row action menu (three-dot)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /* ---------------------------------------------------------------------- */
  /* PINNED PREDICTIONS (persisted per-browser)                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PINNED_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setPinnedIds(new Set(parsed.map(String)));
        }
      }
    } catch (err) {
      console.error("Unable to read pinned predictions:", err);
    }
  }, []);

  const togglePin = (id: string) => {
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      try {
        window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch (err) {
        console.error("Unable to save pinned predictions:", err);
      }

      return next;
    });
  };

  /* ---------------------------------------------------------------------- */
  /* LOAD HISTORY                                                           */
  /* ---------------------------------------------------------------------- */

  const loadHistory = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetchHistory();

      const data = Array.isArray(response)
        ? response
        : (response as any)?.items ??
          (response as any)?.history ??
          (response as any)?.predictions ??
          (response as any)?.data ??
          [];

      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("History loading failed:", err);
      setError(err instanceof Error ? err.message : "Unable to load prediction history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  // Record the activity event once per mount (best-effort, admin retention analytics).
  useEffect(() => {
    void recordActivityEvent("prediction_history_opened");
  }, []);

  /* ---------------------------------------------------------------------- */
  /* CLOSE ROW MENU ON OUTSIDE CLICK / ESC / SCROLL / RESIZE                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const closeMenu = () => {
      setMenuOpenId(null);
      setMenuPosition(null);
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* FILTERED + SORTED HISTORY (pinned rows float to the top)               */
  /* ---------------------------------------------------------------------- */

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matches = items.filter((item) => {
      const disease = getDisease(item).toLowerCase();
      const filename = getFilename(item).toLowerCase();
      const severity = getSeverity(item).toLowerCase();
      const confidence = getConfidence(item);
      const healthy = disease.includes("healthy");
      const pinned = pinnedIds.has(getPredictionId(item));

      const matchesSearch =
        !query || disease.includes(query) || filename.includes(query) || severity.includes(query);

      let matchesFilter = true;

      switch (filter) {
        case "pinned":
          matchesFilter = pinned;
          break;
        case "disease":
          matchesFilter = !healthy;
          break;
        case "healthy":
          matchesFilter = healthy;
          break;
        case "high":
          matchesFilter = confidence >= 0.8;
          break;
        case "medium":
          matchesFilter = confidence >= 0.5 && confidence < 0.8;
          break;
        case "low":
          matchesFilter = confidence < 0.5;
          break;
        default:
          matchesFilter = true;
      }

      return matchesSearch && matchesFilter;
    });

    return [...matches].sort((a, b) => {
      const aPinned = pinnedIds.has(getPredictionId(a)) ? 1 : 0;
      const bPinned = pinnedIds.has(getPredictionId(b)) ? 1 : 0;
      return bPinned - aPinned;
    });
  }, [items, search, filter, pinnedIds]);

  /* ---------------------------------------------------------------------- */
  /* DELETE                                                                 */
  /* ---------------------------------------------------------------------- */

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;

    const id = getPredictionId(deleteTarget);

    if (!id) {
      setError("Prediction ID is missing.");
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    setError("");

    try {
      await deleteHistoryItem(id);

      setItems((current) => current.filter((item) => getPredictionId(item) !== id));

      if (exportItem && getPredictionId(exportItem) === id) setExportItem(null);
      if (shareItem && getPredictionId(shareItem) === id) setShareItem(null);

      setDeleteTarget(null);
      setMenuOpenId(null);
      setMenuPosition(null);

      toast.success({ title: "Prediction deleted", message: "The record has been removed from your history." });
    } catch (err) {
      console.error("Delete history failed:", err);
      const msg = err instanceof Error ? err.message : "Unable to delete this prediction.";
      setError(msg);
      toast.error({ title: "Couldn't delete prediction", message: msg });
    } finally {
      setDeleting(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* OPEN RESULT VIEW                                                       */
  /* ---------------------------------------------------------------------- */

  const openInResultView = (item: HistoryItem) => {
    try {
      const prediction = historyItemToPrediction(item);
      const imageUrl = getImageUrl(item);
      setLastResult(prediction, imageUrl || undefined);

      setDiagnosticTab("upload");
      router.push("/dashboard/detection");
    } catch (err) {
      console.error("Unable to open prediction:", err);
      setError("Unable to open this diagnostic result.");
    }
  };

  /* ---------------------------------------------------------------------- */
  /* ROW ACTION MENU                                                        */
  /* ---------------------------------------------------------------------- */

  const toggleMenu = (event: React.MouseEvent<HTMLButtonElement>, item: HistoryItem) => {
    event.stopPropagation();

    const id = getPredictionId(item);

    if (menuOpenId === id) {
      setMenuOpenId(null);
      setMenuPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 180;
    const menuHeight = 196;
    const gap = 6;
    const padding = 8;

    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;

    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }

    if (top + menuHeight > window.innerHeight - padding) {
      top = rect.top - menuHeight - gap;
    }
    if (top < padding) top = padding;

    setMenuOpenId(id);
    setMenuPosition({ top, left });
  };

  /* ---------------------------------------------------------------------- */
  /* STATS                                                                  */
  /* ---------------------------------------------------------------------- */

  const totalCount = items.length;

  const diseaseCount = items.filter(
    (item) => !getDisease(item).toLowerCase().includes("healthy")
  ).length;

  const healthyCount = items.filter((item) =>
    getDisease(item).toLowerCase().includes("healthy")
  ).length;

  const averageConfidence =
    totalCount > 0 ? items.reduce((sum, item) => sum + getConfidence(item), 0) / totalCount : 0;

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <>
    <div className="mx-auto max-w-7xl animate-slide-up space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">WheatGuard AI</p>

          <div className="mt-0.5 flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-700 dark:text-brand-300" style={{ fontSize: 27 }}>
              history
            </span>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Prediction History</h1>
          </div>

          <p className="mt-1 text-xs text-muted">
            Review previous wheat disease predictions and download diagnostic reports.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Total Analyses
              </p>
              <p className="mt-2 text-2xl font-bold text-ink">{totalCount}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
              <span className="material-symbols-outlined text-blue-600">analytics</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Diseases Detected
              </p>
              <p className="mt-2 text-2xl font-bold text-ink">{diseaseCount}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft">
              <span className="material-symbols-outlined text-danger">coronavirus</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Healthy</p>
              <p className="mt-2 text-2xl font-bold text-ink">{healthyCount}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/40">
              <span className="material-symbols-outlined text-brand-700 dark:text-brand-300">eco</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Avg. Confidence
              </p>
              <p className="mt-2 text-2xl font-bold text-ink">
                {(averageConfidence * 100).toFixed(1)}%
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning-soft dark:bg-warning/10">
              <span className="material-symbols-outlined text-warning">verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search / Filter */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl text-muted">
              search
            </span>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search disease, filename, or severity..."
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-xs text-ink outline-none transition placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:ring-brand-800"
            />
          </div>

          <SelectMenu
            ariaLabel="Filter results"
            icon="filter_list"
            className="w-full lg:w-48"
            value={filter}
            onChange={(v) => setFilter(v)}
            options={FILTER_OPTIONS}
          />

          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-xs font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-xl ${loading ? "animate-spin" : ""}`}>
              refresh
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-danger" style={{ fontSize: 19 }}>error</span>
            <p className="text-xs text-danger">{error}</p>
          </div>

          <button type="button" onClick={() => setError("")} className="text-red-500 hover:text-danger">
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>close</span>
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-ink">Previous Predictions</h2>
            <p className="mt-0.5 text-xs text-muted">
              {filteredItems.length} result{filteredItems.length === 1 ? "" : "s"} found
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px]">
            <thead>
              <tr className="border-b border-line bg-surface-muted/80">
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted">
                  Prediction
                </th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted">
                  Confidence
                </th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted">
                  Severity
                </th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted">
                  Date
                </th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-muted">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={5} className="px-5 py-5">
                      <div className="h-12 animate-pulse rounded-xl bg-surface-muted" />
                    </td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                      <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
                        history
                      </span>
                    </div>

                    <h3 className="mt-4 text-sm font-bold text-ink">No predictions found</h3>

                    <p className="mx-auto mt-1 max-w-md text-xs text-muted">
                      {items.length === 0
                        ? "Run a wheat leaf analysis to create your first prediction."
                        : "Try changing your search or filter."}
                    </p>

                    {items.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setDiagnosticTab("upload");
                          router.push("/dashboard/detection");
                        }}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/40"
                      >
                        <span className="material-symbols-outlined text-lg">add_a_photo</span>
                        Analyse a Leaf
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const predictionId = getPredictionId(item);
                  const disease = getDisease(item);
                  const confidence = getConfidence(item);
                  const severity = getSeverity(item);
                  const healthy = disease.toLowerCase().includes("healthy");
                  const pinned = pinnedIds.has(predictionId);

                  return (
                    <tr
                      key={`${predictionId}-${index}`}
                      className={`group transition hover:bg-surface-muted/70 ${
                        pinned ? "bg-brand-50/30 dark:bg-brand-900/20" : ""
                      }`}
                    >
                      {/* Prediction */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <HistoryThumbnail item={item} />

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {pinned && (
                                <span
                                  className="material-symbols-outlined shrink-0 text-brand-700 dark:text-brand-300"
                                  style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}
                                  title="Pinned"
                                >
                                  push_pin
                                </span>
                              )}
                              <div className="truncate text-xs font-bold text-ink">
                                {formatDisease(disease)}
                              </div>
                            </div>
                            <div className="max-w-[220px] truncate text-xs text-muted">
                              {getFilename(item)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Confidence */}
                      <td className="px-5 py-4">
                        <div className="w-[140px]">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-xs font-bold text-ink">
                              {(confidence * 100).toFixed(1)}%
                            </span>
                          </div>

                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className={`h-full rounded-full ${confidenceBarClass(confidence, disease)}`}
                              style={{ width: `${Math.min(confidence * 100, 100)}%` }}
                            />
                          </div>

                          <p
                            className={`mt-1 text-xs font-semibold ${getConfidenceTier(confidence, disease).textClass}`}
                          >
                            {getConfidenceTier(confidence, disease).label}
                          </p>
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                            healthy
                              ? "border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300"
                              : "border-warning/30 bg-warning-soft dark:bg-warning/10 text-warning"
                          }`}
                        >
                          {severity}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4">
                        <p className="text-xs font-medium text-ink">
                          {formatDate(getCreatedAt(item))}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatTime(getCreatedAt(item))}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void recordActivityEvent("prediction_viewed", { predictionId });
                              router.push(`/dashboard/history/${predictionId}`);
                            }}
                            title="View diagnostic"
                            aria-label="View diagnostic"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:border-brand-300 dark:border-brand-700 hover:bg-brand-50 dark:bg-brand-900/40 hover:text-brand-700 dark:text-brand-300"
                          >
                            <span className="material-symbols-outlined text-xl">visibility</span>
                          </button>

                          <button
                            type="button"
                            onClick={(event) => toggleMenu(event, item)}
                            title="More actions"
                            aria-label="More actions"
                            aria-expanded={menuOpenId === predictionId}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                              menuOpenId === predictionId
                                ? "border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300"
                                : "border-line bg-surface text-muted hover:border-brand-300 dark:border-brand-700 hover:bg-brand-50 dark:bg-brand-900/40 hover:text-brand-700 dark:text-brand-300"
                            }`}
                          >
                            <span className="material-symbols-outlined text-2xl">more_vert</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Information */}
      <div className="flex items-start gap-3 rounded-2xl border border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-900/30 px-4 py-3">
        <span className="material-symbols-outlined mt-0.5 text-brand-700 dark:text-brand-300" style={{ fontSize: 18 }}>
          info
        </span>

        <p className="text-xs leading-relaxed text-brand-900 dark:text-brand-200">
          Select <strong>View</strong> to inspect the complete diagnostic record. Use the three-dot
          menu to pin a record to the top, download an A4 PDF, editable PowerPoint, or PNG image
          report, share it, or delete it.
        </p>
      </div>
    </div>

      {/* Fixed row action menu */}
      {menuOpenId && menuPosition && (
        <div
          ref={menuRef}
          className="fixed z-[95] w-[180px] overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-xl"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <button
            type="button"
            onClick={() => {
              togglePin(menuOpenId);
              setMenuOpenId(null);
              setMenuPosition(null);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-ink transition hover:bg-brand-50 dark:bg-brand-900/40 hover:text-brand-800 dark:text-brand-300"
          >
            <span
              className="material-symbols-outlined text-xl"
              style={pinnedIds.has(menuOpenId) ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              push_pin
            </span>
            {pinnedIds.has(menuOpenId) ? "Unpin" : "Pin to top"}
          </button>

          <button
            type="button"
            onClick={() => {
              const item = items.find((historyItem) => getPredictionId(historyItem) === menuOpenId);
              setMenuOpenId(null);
              setMenuPosition(null);
              if (item) setExportItem(item);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-ink transition hover:bg-brand-50 dark:bg-brand-900/40 hover:text-brand-800 dark:text-brand-300"
          >
            <span className="material-symbols-outlined text-xl">download</span>
            Download
          </button>

          <button
            type="button"
            onClick={() => {
              const item = items.find((historyItem) => getPredictionId(historyItem) === menuOpenId);
              setMenuOpenId(null);
              setMenuPosition(null);
              if (item) setShareItem(item);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-ink transition hover:bg-brand-50 dark:bg-brand-900/40 hover:text-brand-800 dark:text-brand-300"
          >
            <span className="material-symbols-outlined text-xl">share</span>
            Share
          </button>

          <button
            type="button"
            onClick={() => {
              const item = items.find((historyItem) => getPredictionId(historyItem) === menuOpenId);
              setMenuOpenId(null);
              setMenuPosition(null);
              if (item) setDeleteTarget(item);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-danger transition hover:bg-danger-soft"
          >
            <span className="material-symbols-outlined text-xl">delete</span>
            Delete
          </button>
        </div>
      )}

      {/* Export Modal */}
      <HistoryExportModal item={exportItem} onClose={() => setExportItem(null)} />

      {/* Share Modal */}
      <ShareModal item={shareItem} onClose={() => setShareItem(null)} />

      {/* Delete Modal */}
      <ConfirmModal
        item={deleteTarget}
        loading={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </>
  );
}