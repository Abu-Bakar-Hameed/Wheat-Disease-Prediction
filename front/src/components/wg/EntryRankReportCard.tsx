"use client";

import type { AiDiagnosisReport } from "@/lib/api";

interface Props {
  report: AiDiagnosisReport;
  compact?: boolean;
  showRegenerate?: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
  showPptx?: boolean;
  onDownloadPptx?: () => void;
  pptxLoading?: boolean;
}

export function EntryRankReportCard({
  report,
  compact = false,
  showRegenerate = false,
  onRegenerate,
  regenerating = false,
  showPptx = false,
  onDownloadPptx,
  pptxLoading = false,
}: Props) {
  return (
    <div className={`rounded-xl border border-line bg-white shadow-sm ${compact ? "p-4" : "p-5"} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[18px] font-bold text-brand-900 flex items-center gap-2">
            <span>🌾</span>
            {report.title || "EntryRank Detection"}
          </div>
          <div className="mt-2 space-y-1 text-[14px]">
            <p>
              <span className="font-semibold text-muted">Disease: </span>
              <span className="font-bold text-ink">{report.disease}</span>
            </p>
            <p>
              <span className="font-semibold text-muted">Confidence: </span>
              <span className="font-bold font-mono text-brand-700">{report.confidence_pct}%</span>
            </p>
          </div>
        </div>
        {report.generated_by && (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#eaedff] text-brand-900">
            {report.generated_by === "openrouter"
              ? "OpenRouter"
              : report.generated_by === "gemini"
                ? "Google Gemini"
                : "Knowledge Base"}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Section emoji="🔴" label="PROBLEM" text={report.problem} accent="border-danger/30 bg-[#fff8f6]" />
        <Section emoji="🟡" label="RECOMMENDATION" text={report.recommendation} accent="border-wheat-600/30 bg-[#fffbeb]" />
        <Section emoji="🟢" label="SOLUTION" text={report.solution} accent="border-brand-700/30 bg-brand-50" />
      </div>

      {(showRegenerate || showPptx) && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
          {showRegenerate && onRegenerate && (
            <ActionBtn
              icon="autorenew"
              label={regenerating ? "Regenerating…" : "Regenerate Report"}
              onClick={onRegenerate}
              loading={regenerating}
            />
          )}
          {showPptx && onDownloadPptx && (
            <ActionBtn
              icon="slideshow"
              label={pptxLoading ? "Generating PPT…" : "Download PPT"}
              onClick={onDownloadPptx}
              loading={pptxLoading}
              primary
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  emoji,
  label,
  text,
  accent,
}: {
  emoji: string;
  label: string;
  text: string;
  accent: string;
}) {
  return (
    <div className={`p-3 rounded-lg border ${accent}`}>
      <div className="text-[11px] font-bold text-brand-900 mb-1.5 flex items-center gap-1.5">
        <span>{emoji}</span>
        {label}
      </div>
      <p className="text-[13px] text-muted leading-relaxed">{text}</p>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  loading,
  primary = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50 ${
        primary
          ? "bg-brand-800 text-white hover:bg-brand-900"
          : "border border-line bg-white text-brand-900 hover:bg-[#eaedff]"
      }`}
    >
      <span className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`} style={{ fontSize: 14 }}>
        {loading ? "refresh" : icon}
      </span>
      {label}
    </button>
  );
}
