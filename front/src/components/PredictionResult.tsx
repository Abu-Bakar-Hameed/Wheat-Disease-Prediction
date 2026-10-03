"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Eye,
  ExternalLink,
  Info,
  Leaf,
  Loader2,
  Shield,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
} from "lucide-react";
import type { PredictionResponse } from "@/types";
import {
  cn,
  confidenceColour,
  confidenceLevelColour,
  humaniseClassName,
  severityColour,
  severityEmoji,
} from "@/lib/utils";

interface PredictionResultProps {
  result: PredictionResponse;
}

export function PredictionResult({ result }: PredictionResultProps) {
  const [gradcamTab, setGradcamTab] = useState<"overlay" | "heatmap" | "original">("overlay");
  const [diseaseOpen, setDiseaseOpen] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const { generatePredictionPdf } = await import("@/lib/generatePdf");
      await generatePredictionPdf(result);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfLoading(false);
    }
  };

  const severity = result.severity || result.disease_info.severity;
  const colours = severityColour(severity);
  const isHealthy = severity === "none" || result.prediction?.toLowerCase() === "healthy";
  const confPct = result.confidence_percentage;

  return (
    <div className="space-y-3">

      {/* ── 1. Hero result card ──────────────────────────────────── */}
      <div className={cn(
        "overflow-hidden rounded-2xl border-2",
        colours.border
      )}>
        {/* Coloured top stripe */}
        <div className={cn("px-5 py-4", colours.bg)}>
          {/* Label row */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-zinc-400">
              AI Analysis Result
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-zinc-500">
              <Clock className="h-3 w-3" />
              {result.inference_time_ms?.toFixed(0)} ms
            </span>
          </div>

          {/* Disease name + badges */}
          <h2 className={cn("text-2xl font-extrabold leading-tight", colours.text)}>
            {humaniseClassName(result.prediction)}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={severity} colours={colours} />
            <ConfidenceBadge level={result.confidence_level} />
            {result.low_confidence && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                <AlertTriangle className="h-3 w-3" /> Low confidence
              </span>
            )}
          </div>

          {/* Status line */}
          <p className={cn("mt-3 flex items-center gap-1.5 text-sm font-medium", colours.text)}>
            {isHealthy ? (
              <><CheckCircle2 className="h-4 w-4" /> No disease detected — continue regular monitoring.</>
            ) : (
              <><ShieldAlert className="h-4 w-4" /> Disease detected — review guidance below.</>
            )}
          </p>
        </div>

        {/* White confidence section */}
        <div className="bg-white px-5 py-4 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
                  Confidence Score
                </span>
                <span className={cn("text-2xl font-extrabold tabular-nums", colours.text)}>
                  {confPct.toFixed(1)}%
                </span>
              </div>
              {/* Multi-segment progress track */}
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    confidenceColour(confPct)
                  )}
                  style={{ width: `${Math.min(confPct, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={confPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
                {/* Threshold markers */}
                {[40, 60, 80].map((mark) => (
                  <div
                    key={mark}
                    className="absolute top-0 h-full w-px bg-white/60"
                    style={{ left: `${mark}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-gray-400 dark:text-zinc-600">
                <span>Very Low</span><span>Low</span><span>Moderate</span><span>High</span>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          {!isHealthy && (
            <p className="mt-3 text-xs text-gray-400 dark:text-zinc-500">
              <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-400" />
              AI prediction only — consult a qualified agricultural expert before treatment.
            </p>
          )}
        </div>
      </div>

      {/* ── 2. Top Predictions ───────────────────────────────────── */}
      <Section title="Top Predictions" subtitle="Ranked by model confidence" icon={<TrendingUp className="h-4 w-4" />}>
        <ul className="space-y-2.5">
          {result.top_predictions.map((p) => {
            const isTop = p.rank === 1;
            return (
              <li key={p.rank} className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5",
                isTop
                  ? "bg-green-50 dark:bg-green-950/20"
                  : "bg-gray-50 dark:bg-zinc-800/40"
              )}>
                <span className={cn(
                  "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  isTop
                    ? "bg-green-600 text-white"
                    : "bg-gray-200 text-gray-600 dark:bg-zinc-700 dark:text-zinc-300"
                )}>
                  {p.rank}
                </span>
                <span className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-zinc-100">
                  {humaniseClassName(p.class_name)}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", confidenceColour(p.confidence_percentage))}
                      style={{ width: `${Math.min(p.confidence_percentage, 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-bold tabular-nums text-gray-700 dark:text-zinc-200">
                    {p.confidence_percentage.toFixed(1)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ── 3. Grad-CAM ─────────────────────────────────────────── */}
      {result.gradcam_available && result.gradcam && (
        <Section title="Visual Explanation" subtitle="Why did the AI make this prediction?" icon={<Eye className="h-4 w-4" />}>
          {/* Tab bar */}
          <div className="mb-3 flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800">
            {(["overlay", "heatmap", "original"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setGradcamTab(tab)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-all",
                  gradcamTab === tab
                    ? "bg-white text-gray-900 shadow dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                {tab === "overlay" ? "Overlay" : tab === "heatmap" ? "Heatmap" : "Original"}
              </button>
            ))}
          </div>

          {/* Image viewer */}
          <div className="relative h-60 w-full overflow-hidden rounded-xl bg-zinc-950">
            <Image
              key={gradcamTab}
              src={result.gradcam[gradcamTab]}
              alt={`Grad-CAM ${gradcamTab} view`}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 50vw"
              unoptimized
            />
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-zinc-800/50">
            <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
            <div className="text-xs text-gray-500 dark:text-zinc-400">
              <p className="font-semibold text-gray-700 dark:text-zinc-200">Grad-CAM Explanation</p>
              <p className="mt-0.5">
                <span className="font-medium text-red-500">Red/warm</span> = high AI focus ·{" "}
                <span className="font-medium text-blue-500">Blue/cool</span> = low influence.
                This is an approximate technique, not a clinical diagnosis.
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ── 4. Disease Information (collapsible) ─────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        {/* Collapsible header */}
        <button
          onClick={() => setDiseaseOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400">
              <Stethoscope className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-50">
                {result.disease_info.display_name}
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500">Disease information & guidance</p>
            </div>
          </div>
          {diseaseOpen
            ? <ChevronUp className="h-4 w-4 text-gray-400" />
            : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        {diseaseOpen && (
          <div className="border-t border-gray-100 px-5 pb-5 pt-4 dark:border-zinc-800">
            <p className="mb-4 text-sm leading-relaxed text-gray-600 dark:text-zinc-300">
              {result.disease_info.description}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {result.disease_info.symptoms.length > 0 && (
                <InfoGroup
                  title="Symptoms"
                  icon={<Info className="h-3.5 w-3.5" />}
                  colour="text-blue-600 dark:text-blue-400"
                  dotColour="bg-blue-400"
                  items={result.disease_info.symptoms}
                />
              )}
              {result.disease_info.prevention.length > 0 && (
                <InfoGroup
                  title="Prevention"
                  icon={<Shield className="h-3.5 w-3.5" />}
                  colour="text-green-600 dark:text-green-400"
                  dotColour="bg-green-400"
                  items={result.disease_info.prevention}
                />
              )}
            </div>

            {result.disease_info.management.length > 0 && (
              <div className="mt-4">
                <InfoGroup
                  title="Management"
                  icon={<Leaf className="h-3.5 w-3.5" />}
                  colour="text-orange-600 dark:text-orange-400"
                  dotColour="bg-orange-400"
                  items={result.disease_info.management}
                />
              </div>
            )}

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <strong>Disclaimer:</strong> {result.disease_info.disclaimer}
            </div>
          </div>
        )}
      </div>

      {/* ── 5. Recommendation ───────────────────────────────────── */}
      {result.recommendation && (
        <div className={cn(
          "flex gap-3 rounded-2xl border px-4 py-3.5",
          isHealthy
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20"
            : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
        )}>
          {isHealthy
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
            : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />}
          <div>
            <p className={cn(
              "text-sm font-semibold",
              isHealthy ? "text-green-800 dark:text-green-200" : "text-amber-800 dark:text-amber-200"
            )}>
              Recommendation
            </p>
            <p className={cn(
              "mt-0.5 text-xs leading-relaxed",
              isHealthy ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"
            )}>
              {result.recommendation}
            </p>
          </div>
        </div>
      )}

      {/* ── 6. Generate PDF ─────────────────────────────────────── */}
      <button
        onClick={handleDownloadPdf}
        disabled={pdfLoading}
        aria-label="Generate PDF report"
        className={cn(
          "flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-3.5 text-sm font-semibold transition-all",
          pdfLoading
            ? "cursor-wait border-gray-200 bg-gray-50 text-gray-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
            : "border-green-200 bg-green-50 text-green-700 hover:border-green-400 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400 dark:hover:border-green-600 dark:hover:bg-green-950/40"
        )}
      >
        {pdfLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating PDF…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Generate PDF Report
          </>
        )}
      </button>

      {/* ── 7. Learn more CTA ───────────────────────────────────── */}
      {!isHealthy && (
        <Link
          href={`/diseases?highlight=${encodeURIComponent(result.prediction)}`}
          className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5 transition hover:border-green-300 hover:bg-green-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-green-700 dark:hover:bg-green-950/20"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400">
              <Stethoscope className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-zinc-100">
                Learn about {humaniseClassName(result.prediction)}
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500">
                Symptoms, prevention & management guidance
              </p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-zinc-500" />
        </Link>
      )}
    </div>
  );
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function Section({
  title, subtitle, icon, children,
}: {
  title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-50">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function InfoGroup({
  title, icon, colour, dotColour, items,
}: {
  title: string; icon: React.ReactNode; colour: string; dotColour: string; items: string[];
}) {
  return (
    <div>
      <h4 className={cn("mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide", colour)}>
        {icon} {title}
      </h4>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-zinc-300">
            <span className={cn("mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full", dotColour)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeverityBadge({
  severity, colours,
}: {
  severity: string;
  colours: ReturnType<typeof severityColour>;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", colours.badge)}>
      {severityEmoji(severity)} {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", confidenceLevelColour(level))}>
      {level} Confidence
    </span>
  );
}
