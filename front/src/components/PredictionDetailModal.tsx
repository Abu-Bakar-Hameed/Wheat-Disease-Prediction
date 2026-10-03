"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileImage,
  FlaskConical,
  Leaf,
  Loader2,
  Maximize2,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import type { HistoryItem } from "@/types";

import {
  cn,
  fmtDate,
  humaniseClassName,
  severityColour,
  severityEmoji,
} from "@/lib/utils";

interface PredictionDetailModalProps {
  item: HistoryItem | null;
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/* Disease Information                                                        */
/* -------------------------------------------------------------------------- */

function getDiseaseInfo(rawClass: string) {
  const value = (rawClass ?? "").toLowerCase().replace(/[_-]/g, " ");

  if (value.includes("brown rust")) {
    return {
      problem:
        "Brown rust is a fungal wheat disease that produces small orange-brown rust pustules on leaves. Severe infection can reduce photosynthetic activity and affect grain development.",
      recommendation:
        "Monitor the crop regularly and identify new infections early. Maintain balanced crop nutrition, avoid unnecessary nitrogen excess, and follow locally recommended disease-management practices.",
      treatment:
        "For significant infection, consult a qualified agronomist about an approved fungicide appropriate for wheat and brown rust. Apply only according to the product label and local agricultural guidance.",
      icon: "rust",
    };
  }

  if (value.includes("yellow rust")) {
    return {
      problem:
        "Yellow rust is a fungal disease characterized by yellow to orange-yellow stripes of pustules on wheat leaves. It can spread rapidly under favorable cool and humid conditions.",
      recommendation:
        "Inspect the crop frequently, particularly during cool and humid weather. Monitor disease spread and use resistant varieties and integrated disease-management practices where available.",
      treatment:
        "If treatment is required, consult an agricultural professional about an approved fungicide for wheat and yellow rust. Follow the product label, application timing, and local regulations.",
      icon: "rust",
    };
  }

  if (value.includes("stripe rust")) {
    return {
      problem:
        "Stripe rust is a fungal disease that forms yellow-orange pustules in characteristic stripes along wheat leaves and can reduce plant productivity when infection becomes severe.",
      recommendation:
        "Increase field monitoring and identify new infection early. Consider resistant varieties and appropriate cultural practices as part of an integrated management strategy.",
      treatment:
        "For economically important infections, seek professional advice on an approved wheat fungicide and appropriate application timing.",
      icon: "rust",
    };
  }

  if (value.includes("septoria") || value.includes("leaf blotch")) {
    return {
      problem:
        "Leaf blotch diseases can produce brown or tan lesions on wheat foliage and may reduce the leaf area available for photosynthesis.",
      recommendation:
        "Monitor lesion development and crop progression. Use balanced crop nutrition, good field sanitation, and resistant varieties where available.",
      treatment:
        "Where disease pressure warrants treatment, consult an agronomist about an approved fungicide suitable for the specific wheat disease and local conditions.",
      icon: "leaf",
    };
  }

  if (value.includes("powdery mildew")) {
    return {
      problem:
        "Powdery mildew is a fungal disease that can appear as white, powder-like growth on wheat leaves and stems. Severe infections can interfere with photosynthesis.",
      recommendation:
        "Improve crop monitoring and avoid conditions that encourage excessive canopy humidity. Use resistant varieties and integrated disease-management practices where possible.",
      treatment:
        "If treatment is necessary, obtain professional advice about an approved fungicide for wheat and powdery mildew. Follow the product label carefully.",
      icon: "leaf",
    };
  }

  if (
    value.includes("healthy") ||
    value.includes("normal") ||
    value.includes("no disease")
  ) {
    return {
      problem:
        "No significant wheat disease symptoms were identified by the AI model in the analyzed image.",
      recommendation:
        "Continue regular crop scouting and maintain good irrigation, nutrition, field hygiene, and pest-management practices.",
      treatment:
        "No disease treatment is indicated from this AI result. Continue monitoring the crop for any new symptoms.",
      icon: "healthy",
    };
  }

  return {
    problem:
      "The AI model detected visual characteristics associated with a possible wheat health issue. The result should be treated as an AI-assisted screening result rather than a confirmed diagnosis.",
    recommendation:
      "Inspect the crop closely and compare symptoms across multiple plants. Consider environmental conditions, crop variety, growth stage, and recent field-management activities.",
    treatment:
      "Do not apply treatment solely from this prediction. Consult a qualified agricultural expert for confirmation and appropriate treatment recommendations.",
    icon: "warning",
  };
}

/* -------------------------------------------------------------------------- */
/* Wheat Illustration                                                         */
/* -------------------------------------------------------------------------- */

function WheatSvg({
  className,
  healthy = false,
}: {
  className?: string;
  healthy?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M59 104C60 80 59 54 59 24"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M59 66C48 61 40 54 35 45"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      <path
        d="M59 78C70 72 78 64 83 55"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      <path
        d="M59 89C49 84 43 79 39 71"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      <path
        d="M59 96C68 91 75 85 79 77"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {[25, 34, 43, 52].map((y, i) => (
        <g key={y}>
          <ellipse
            cx={51 - i * 2}
            cy={y}
            rx="7"
            ry="3.5"
            transform={`rotate(-35 ${51 - i * 2} ${y})`}
            fill="currentColor"
          />

          <ellipse
            cx={67 + i * 2}
            cy={y + 3}
            rx="7"
            ry="3.5"
            transform={`rotate(35 ${67 + i * 2} ${y + 3})`}
            fill="currentColor"
          />
        </g>
      ))}

      {!healthy && (
        <>
          <circle
            cx="43"
            cy="69"
            r="3"
            fill="currentColor"
            opacity="0.65"
          />

          <circle
            cx="74"
            cy="60"
            r="2.5"
            fill="currentColor"
            opacity="0.65"
          />

          <circle
            cx="48"
            cy="82"
            r="2.5"
            fill="currentColor"
            opacity="0.65"
          />
        </>
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Confidence Gauge                                                           */
/* -------------------------------------------------------------------------- */

function ConfidenceGauge({ value }: { value: number }) {
  const safeValue = Math.max(
    0,
    Math.min(Number(value) || 0, 100)
  );

  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const dash = (safeValue / 100) * circumference;

  return (
    <div className="relative h-32 w-32 shrink-0 sm:h-36 sm:w-36">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full -rotate-90"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-gray-200 dark:text-zinc-800"
        />

        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="text-emerald-500 transition-all duration-1000"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-gray-950 dark:text-white sm:text-3xl">
          {safeValue.toFixed(1)}%
        </span>

        <span className="mt-1 text-[9px] font-black uppercase tracking-[0.15em] text-gray-400 dark:text-zinc-500">
          Confidence
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Severity Meter                                                             */
/* -------------------------------------------------------------------------- */

function SeverityMeter({
  severity,
}: {
  severity?: string | null;
}) {
  const value = (severity ?? "").toLowerCase();

  const levels = [
    {
      name: "None",
      color: "bg-emerald-500",
    },
    {
      name: "Moderate",
      color: "bg-yellow-500",
    },
    {
      name: "High",
      color: "bg-orange-500",
    },
    {
      name: "Critical",
      color: "bg-red-500",
    },
  ];

  const activeIndex =
    value === "critical"
      ? 3
      : value === "high"
        ? 2
        : value === "moderate"
          ? 1
          : value === "none"
            ? 0
            : -1;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 dark:text-zinc-500">
          Severity Level
        </span>

        <span className="text-sm font-black text-gray-900 dark:text-white">
          {severity
            ? severity.charAt(0).toUpperCase() +
              severity.slice(1)
            : "Unknown"}
        </span>
      </div>

      <div className="flex gap-1.5">
        {levels.map((level, index) => (
          <div key={level.name} className="flex-1">
            <div
              className={cn(
                "h-2.5 rounded-full transition-all duration-500",
                index <= activeIndex
                  ? level.color
                  : "bg-gray-200 dark:bg-zinc-800"
              )}
            />

            <p
              className={cn(
                "mt-1.5 text-[8px] font-bold",
                index === activeIndex
                  ? "text-gray-800 dark:text-zinc-200"
                  : "text-gray-400 dark:text-zinc-600"
              )}
            >
              {level.name}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Modal                                                                 */
/* -------------------------------------------------------------------------- */

export function PredictionDetailModal({
  item,
  onClose,
}: PredictionDetailModalProps) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Keyboard                                                                  */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (imageExpanded) {
        setImageExpanded(false);
        return;
      }

      onClose();
    };

    document.addEventListener("keydown", handler);

    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [onClose, imageExpanded]);

  /* ------------------------------------------------------------------------ */
  /* Lock body scroll                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    document.body.style.overflow = item ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [item]);

  const diseaseInfo = useMemo(
    () =>
      getDiseaseInfo(
        item?.predicted_class ?? ""
      ),
    [item?.predicted_class]
  );

  if (!item) return null;

  const colours = severityColour(item.severity);

  const predictedClass =
    item.predicted_class ?? "Unknown";

  const diseaseName =
    humaniseClassName(predictedClass);

  const isHealthy =
    predictedClass
      .toLowerCase()
      .includes("healthy") ||
    predictedClass
      .toLowerCase()
      .includes("normal") ||
    item.severity === "none";

  const topPreds = Array.isArray(
    item.top_predictions
  )
    ? item.top_predictions
    : [];

  const confidence = Math.max(
    0,
    Math.min(
      Number(item.confidence_pct ?? 0),
      100
    )
  );

  /* ------------------------------------------------------------------------ */
  /* PDF GENERATION                                                           */
  /* ------------------------------------------------------------------------ */

  const handlePdf = async () => {
    setPdfLoading(true);

    try {
      const { jsPDF } = await import("jspdf");

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();

      const ML = 15;
      const MR = 15;
      const CW = PW - ML - MR;

      let y = 0;

      const C = {
        green: [22, 163, 74] as [number, number, number],
        greenL: [240, 253, 244] as [number, number, number],
        navy: [17, 24, 39] as [number, number, number],
        gray: [107, 114, 128] as [number, number, number],
        grayL: [243, 244, 246] as [number, number, number],
        white: [255, 255, 255] as [number, number, number],
        border: [229, 231, 235] as [number, number, number],
        red: [220, 38, 38] as [number, number, number],
        orange: [234, 88, 12] as [number, number, number],
        yellow: [202, 138, 4] as [number, number, number],
      };

      const sevC = (): [number, number, number] => {
        switch (
          item.severity?.toLowerCase()
        ) {
          case "critical":
            return C.red;

          case "high":
            return C.orange;

          case "moderate":
            return C.yellow;

          case "none":
            return C.green;

          default:
            return C.gray;
        }
      };

      const sf = (
        style: "normal" | "bold",
        size: number,
        col = C.navy
      ) => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        doc.setTextColor(...col);
      };

      const fill = (
        x: number,
        ry: number,
        w: number,
        h: number,
        col: [number, number, number]
      ) => {
        doc.setFillColor(...col);
        doc.rect(x, ry, w, h, "F");
      };

      const line = (
        x1: number,
        ry: number,
        x2: number,
        col = C.border
      ) => {
        doc.setDrawColor(...col);
        doc.setLineWidth(0.3);
        doc.line(x1, ry, x2, ry);
      };

      /* -------------------------------------------------------------------- */
      /* PDF Header                                                            */
      /* -------------------------------------------------------------------- */

      fill(0, 0, PW, 38, C.green);

      sf("bold", 16, C.white);

      doc.text(
        "Wheat Disease Prediction System",
        ML,
        13
      );

      sf("normal", 8.5, C.white);

      doc.text(
        "AI-Assisted Wheat Disease Prediction",
        ML,
        20
      );

      sf("normal", 7.5, C.white);

      const now = new Date();

      doc.text(
        `Generated: ${now.toLocaleDateString(
          "en-GB",
          {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }
        )}`,
        ML,
        28
      );

      doc.text(
        `File: ${item.filename}`,
        PW - MR,
        28,
        {
          align: "right",
        }
      );

      y = 46;

      /* -------------------------------------------------------------------- */
      /* Result Card                                                           */
      /* -------------------------------------------------------------------- */

      fill(
        ML,
        y,
        CW,
        36,
        C.grayL
      );

      doc.setDrawColor(...C.border);

      doc.rect(
        ML,
        y,
        CW,
        36,
        "S"
      );

      fill(
        ML,
        y,
        3,
        36,
        sevC()
      );

      sf("bold", 15, C.navy);

      doc.text(
        diseaseName,
        ML + 7,
        y + 10
      );

      sf("normal", 8, C.gray);

      doc.text(
        "CONFIDENCE",
        ML + 7,
        y + 17
      );

      sf("bold", 13, sevC());

      doc.text(
        `${confidence.toFixed(1)}%`,
        ML + 7,
        y + 25
      );

      const sevLabel = (
        item.severity ?? "unknown"
      ).toUpperCase();

      const bW = 38;

      fill(
        PW - MR - bW,
        y + 5,
        bW,
        11,
        sevC()
      );

      sf("bold", 8, C.white);

      doc.text(
        sevLabel,
        PW - MR - bW / 2,
        y + 13,
        {
          align: "center",
        }
      );

      sf("normal", 7, C.gray);

      doc.text(
        "SEVERITY",
        PW - MR - bW / 2,
        y + 21,
        {
          align: "center",
        }
      );

      doc.text(
        fmtDate(item.created_at),
        ML + 7,
        y + 32
      );

      y += 43;

      /* -------------------------------------------------------------------- */
      /* Problem                                                               */
      /* -------------------------------------------------------------------- */

      sf("bold", 11, C.navy);

      doc.text(
        "Problem Detected",
        ML,
        y
      );

      line(
        ML,
        y + 2,
        ML + 50,
        C.green
      );

      y += 8;

      sf(
        "normal",
        8.5,
        C.navy
      );

      const problemLines =
        doc.splitTextToSize(
          diseaseInfo.problem,
          CW
        ) as string[];

      problemLines.forEach(
        (text, index) => {
          doc.text(
            text,
            ML,
            y + index * 4
          );
        }
      );

      y +=
        problemLines.length * 4 +
        8;

      /* -------------------------------------------------------------------- */
      /* Recommendation                                                        */
      /* -------------------------------------------------------------------- */

      const recommendation =
        item.recommendation ||
        diseaseInfo.recommendation;

      const recLines =
        doc.splitTextToSize(
          recommendation,
          CW - 8
        ) as string[];

      const recHeight = Math.max(
        25,
        17 + Math.min(recLines.length, 4) * 4
      );

      fill(
        ML,
        y,
        CW,
        recHeight,
        C.greenL
      );

      sf(
        "bold",
        9,
        C.green
      );

      doc.text(
        "AI RECOMMENDATION",
        ML + 4,
        y + 7
      );

      sf(
        "normal",
        8,
        C.navy
      );

      recLines
        .slice(0, 4)
        .forEach((text, index) => {
          doc.text(
            text,
            ML + 4,
            y + 13 + index * 4
          );
        });

      y += recHeight + 8;

      /* -------------------------------------------------------------------- */
      /* Treatment                                                              */
      /* -------------------------------------------------------------------- */

      sf(
        "bold",
        11,
        C.navy
      );

      doc.text(
        "Treatment & Management",
        ML,
        y
      );

      line(
        ML,
        y + 2,
        ML + 65,
        C.green
      );

      y += 8;

      sf(
        "normal",
        8.5,
        C.navy
      );

      const treatmentLines =
        doc.splitTextToSize(
          diseaseInfo.treatment,
          CW
        ) as string[];

      treatmentLines.forEach(
        (text, index) => {
          doc.text(
            text,
            ML,
            y + index * 4
          );
        }
      );

      y +=
        treatmentLines.length * 4 +
        8;

      /* -------------------------------------------------------------------- */
      /* Top Predictions                                                       */
      /* -------------------------------------------------------------------- */

      if (topPreds.length > 0) {
        sf(
          "bold",
          11,
          C.navy
        );

        doc.text(
          "Top Predictions",
          ML,
          y
        );

        line(
          ML,
          y + 2,
          ML + 48,
          C.green
        );

        y += 8;

        for (
          let i = 0;
          i < Math.min(topPreds.length, 5);
          i++
        ) {
          const p = topPreds[i] as any;

          const pct = Math.max(
            0,
            Math.min(
              Number(
                p.confidence_percentage ?? 0
              ),
              100
            )
          );

          sf(
            "bold",
            8.5,
            C.navy
          );

          doc.text(
            `${p.rank ?? i + 1}. ${humaniseClassName(
              p.class_name ?? ""
            )}`,
            ML,
            y
          );

          doc.text(
            `${pct.toFixed(1)}%`,
            PW - MR,
            y,
            {
              align: "right",
            }
          );

          y += 6;
        }
      }

      /* -------------------------------------------------------------------- */
      /* Disclaimer                                                            */
      /* -------------------------------------------------------------------- */

      y += 6;

      if (y + 28 > PH - 20) {
        doc.addPage();
        y = 20;
      }

      fill(
        ML,
        y,
        CW,
        28,
        C.grayL
      );

      sf(
        "bold",
        7.5,
        C.navy
      );

      doc.text(
        "IMPORTANT DISCLAIMER",
        ML + 3,
        y + 6
      );

      sf(
        "normal",
        7,
        C.gray
      );

      [
        "Wheat Disease Prediction System provides AI-assisted screening only.",
        "This is NOT a confirmed agronomic diagnosis.",
        "Consult a qualified agricultural expert before applying treatment.",
      ].forEach(
        (text, index) => {
          doc.text(
            text,
            ML + 3,
            y + 12 + index * 4
          );
        }
      );

      /* -------------------------------------------------------------------- */
      /* Footer                                                                */
      /* -------------------------------------------------------------------- */

      line(
        ML,
        PH - 12,
        PW - MR
      );

      sf(
        "normal",
        7,
        C.gray
      );

      doc.text(
        "Wheat Disease Prediction System — AI-Assisted Wheat Disease Prediction",
        ML,
        PH - 7
      );

      doc.text(
        "Page 1",
        PW - MR,
        PH - 7,
        {
          align: "right",
        }
      );

      const dateStr =
        now.toISOString().slice(0, 10);

      const safeDiseaseName =
        diseaseName.replace(
          /[^a-zA-Z0-9]+/g,
          "_"
        );

      doc.save(
        `Wheat_Disease_Prediction_Report_${safeDiseaseName}_${dateStr}.pdf`
      );
    } catch (error) {
      console.error(
        "PDF generation failed:",
        error
      );
    } finally {
      setPdfLoading(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* UI                                                                        */
  /* ------------------------------------------------------------------------ */

  return (
    <>
      {/* ================================================================== */}
      {/* MAIN MODAL                                                          */}
      {/* ================================================================== */}

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 backdrop-blur-md sm:p-5"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Prediction details"
      >
        <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">

          {/* ================================================================ */}
          {/* 1. HEADER                                                        */}
          {/* ================================================================ */}

          <header className="relative shrink-0 overflow-hidden border-b border-gray-200 dark:border-zinc-800">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-50 via-white to-green-50 dark:from-emerald-950/40 dark:via-zinc-950 dark:to-green-950/30" />

            <div className="relative flex items-center justify-between px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                  <WheatSvg
                    className="h-8 w-8"
                    healthy={isHealthy}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black tracking-tight text-gray-950 dark:text-white">
                      Wheat Disease Prediction System
                    </span>

                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                      AI
                    </span>
                  </div>

                  <p className="mt-0.5 text-[10px] font-medium text-gray-500 dark:text-zinc-500">
                    Wheat Disease Prediction Report
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close prediction details"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white/80 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* ================================================================ */}
          {/* SCROLLABLE CONTENT                                                */}
          {/* ================================================================ */}

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6 p-4 sm:p-7">

              {/* ============================================================ */}
              {/* 2. LARGE ANALYZED IMAGE — TOP CENTER                        */}
              {/* ============================================================ */}

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ScanSearch className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />

                      <h3 className="text-sm font-black text-gray-950 dark:text-white">
                        Analyzed Image
                      </h3>
                    </div>

                    <p className="mt-1 max-w-[280px] truncate text-[10px] text-gray-500 dark:text-zinc-500">
                      {item.filename}
                    </p>
                  </div>

                  {item.image_url && (
                    <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 sm:block">
                      Image Available
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!item.image_url}
                  onClick={() => {
                    if (item.image_url) {
                      setImageExpanded(true);
                    }
                  }}
                  className={cn(
                    "group relative flex h-[280px] w-full items-center justify-center overflow-hidden rounded-[24px] border bg-gray-50 shadow-sm transition-all sm:h-[350px] lg:h-[400px]",
                    item.image_url
                      ? "cursor-zoom-in border-gray-200 hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-700"
                      : "border-gray-200 dark:border-zinc-800 dark:bg-zinc-900"
                  )}
                >
                  {item.image_url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image_url}
                        alt={`Analyzed wheat leaf — ${item.filename}`}
                        className="h-full w-full object-contain p-3 transition duration-500 group-hover:scale-[1.015] sm:p-5"
                      />

                      <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-14 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-black text-gray-900 shadow-xl">
                          <Maximize2 className="h-4 w-4" />
                          View Fullscreen
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 dark:bg-emerald-950/50">
                        <FileImage className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
                      </div>

                      <p className="mt-4 text-sm font-black text-gray-800 dark:text-zinc-200">
                        Image Not Available
                      </p>

                      <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-zinc-500">
                        No stored image is available for this prediction.
                      </p>
                    </div>
                  )}
                </button>
              </section>

              {/* ============================================================ */}
              {/* 3. DISEASE NAME + STATUS                                     */}
              {/* ============================================================ */}

              <section className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                      Detection Result
                    </p>

                    <h2 className="mt-1 break-words text-2xl font-black tracking-tight text-gray-950 dark:text-white sm:text-3xl">
                      {diseaseName}
                    </h2>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black",
                          colours.badge
                        )}
                      >
                        {isHealthy ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        )}

                        {isHealthy
                          ? "Healthy"
                          : "Disease Detected"}
                      </span>

                      {item.low_confidence && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-black text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Low Confidence
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
                    <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        AI Screening
                      </p>

                      <p className="mt-0.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        Analysis Complete
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* ============================================================ */}
              {/* 4. CONFIDENCE + SEVERITY                                    */}
              {/* ============================================================ */}

              <section className="grid gap-5 md:grid-cols-2">

                {/* Confidence */}
                <div className="relative overflow-hidden rounded-[24px] border border-gray-200 bg-gradient-to-br from-emerald-50 via-white to-green-50 p-5 dark:border-zinc-800 dark:from-emerald-950/30 dark:via-zinc-900 dark:to-green-950/20 sm:p-6">
                  <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />

                  <div className="relative">
                    <div className="mb-4 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />

                      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-500">
                        Model Confidence
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-5 sm:flex-row">
                      <ConfidenceGauge
                        value={confidence}
                      />

                      <div className="text-center sm:text-left">
                        <p className="text-sm font-black text-gray-950 dark:text-white">
                          Prediction Confidence
                        </p>

                        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-zinc-500">
                          Estimated confidence of the AI model for this classification.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Severity */}
                <div className="rounded-[24px] border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
                  <div className="mb-5 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />

                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 dark:text-zinc-500">
                      Disease Severity
                    </span>
                  </div>

                  <SeverityMeter
                    severity={item.severity}
                  />

                  <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4 dark:border-zinc-800">
                    <span className="text-xl">
                      {severityEmoji(item.severity)}
                    </span>

                    <p className="text-xs text-gray-500 dark:text-zinc-500">
                      AI-assisted severity assessment
                    </p>
                  </div>
                </div>
              </section>

              {/* ============================================================ */}
              {/* 5. PROBLEM DETECTED                                         */}
              {/* ============================================================ */}

              <section className="overflow-hidden rounded-[24px] border border-red-100 bg-gradient-to-br from-red-50 to-orange-50 dark:border-red-950/70 dark:from-red-950/25 dark:to-orange-950/20">
                <div className="border-b border-red-100 px-5 py-4 dark:border-red-950/60 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                      <AlertTriangle className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-600 dark:text-red-400">
                        Problem Detected
                      </p>

                      <h3 className="mt-0.5 text-base font-black text-gray-950 dark:text-white">
                        {diseaseName}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <p className="text-sm leading-7 text-gray-700 dark:text-zinc-300">
                    {diseaseInfo.problem}
                  </p>
                </div>
              </section>

              {/* ============================================================ */}
              {/* 6. AI RECOMMENDATION                                        */}
              {/* ============================================================ */}

              <section className="overflow-hidden rounded-[24px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-900/70 dark:from-emerald-950/30 dark:to-teal-950/20">
                <div className="border-b border-emerald-200 px-5 py-4 dark:border-emerald-900/60 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <Sparkles className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                        AI Recommendation
                      </p>

                      <p className="mt-0.5 text-sm font-black text-emerald-950 dark:text-emerald-200">
                        Recommended next steps
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <p className="text-sm leading-7 text-emerald-900 dark:text-emerald-200">
                    {item.recommendation ||
                      diseaseInfo.recommendation}
                  </p>
                </div>
              </section>

              {/* ============================================================ */}
              {/* 7. TREATMENT & MANAGEMENT                                   */}
              {/* ============================================================ */}

              <section className="overflow-hidden rounded-[24px] border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 dark:border-blue-950/70 dark:from-blue-950/25 dark:to-cyan-950/20">
                <div className="border-b border-blue-100 px-5 py-4 dark:border-blue-950/60 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                      <FlaskConical className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                        Treatment & Management
                      </p>

                      <p className="mt-0.5 text-sm font-black text-blue-950 dark:text-blue-200">
                        Disease management guidance
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <p className="text-sm leading-7 text-blue-900 dark:text-blue-200">
                    {diseaseInfo.treatment}
                  </p>
                </div>
              </section>

              {/* ============================================================ */}
              {/* 8. TOP PREDICTIONS                                          */}
              {/* ============================================================ */}

              {topPreds.length > 0 && (
                <section className="rounded-[24px] border border-gray-200 bg-gray-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70 sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <ScanSearch className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />

                        <h3 className="text-sm font-black text-gray-950 dark:text-white">
                          Top Predictions
                        </h3>
                      </div>

                      <p className="mt-1 text-xs text-gray-500 dark:text-zinc-500">
                        Alternative classes considered by the model
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[9px] font-black text-gray-500 shadow-sm dark:bg-zinc-800 dark:text-zinc-400">
                      TOP {topPreds.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {topPreds.map(
                      (p: any, index: number) => {
                        const pct = Math.max(
                          0,
                          Math.min(
                            Number(
                              p.confidence_percentage ??
                                0
                            ),
                            100
                          )
                        );

                        const rank =
                          p.rank ?? index + 1;

                        return (
                          <div
                            key={`${p.class_name ?? "prediction"}-${rank}-${index}`}
                            className={cn(
                              "rounded-2xl border p-4 transition",
                              rank === 1
                                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20"
                                : "border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black",
                                  rank === 1
                                    ? "bg-emerald-600 text-white"
                                    : "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400"
                                )}
                              >
                                #{rank}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-bold text-gray-800 dark:text-zinc-200">
                                    {humaniseClassName(
                                      p.class_name ?? ""
                                    )}
                                  </span>

                                  <span className="shrink-0 text-xs font-black text-gray-700 dark:text-zinc-300">
                                    {pct.toFixed(1)}%
                                  </span>
                                </div>

                                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-800">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-700",
                                      rank === 1
                                        ? "bg-emerald-500"
                                        : "bg-gray-400 dark:bg-zinc-600"
                                    )}
                                    style={{
                                      width: `${pct}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </section>
              )}

              {/* ============================================================ */}
              {/* 9. PREDICTION METADATA                                      */}
              {/* ============================================================ */}

              <section className="overflow-hidden rounded-[24px] border border-gray-200 dark:border-zinc-800">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
                  <div className="flex items-center gap-2">
                    <Leaf className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />

                    <h3 className="text-sm font-black text-gray-900 dark:text-white">
                      Prediction Metadata
                    </h3>
                  </div>

                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-600">
                    Details
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2">
                  {[
                    [
                      "File",
                      item.filename,
                    ],
                    [
                      "Prediction Date",
                      fmtDate(item.created_at),
                    ],
                    [
                      "Inference Time",
                      item.inference_time_ms !==
                        null &&
                      item.inference_time_ms !==
                        undefined
                        ? `${Number(
                            item.inference_time_ms
                          ).toFixed(0)} ms`
                        : "—",
                    ],
                    [
                      "Model Version",
                      item.model_version ?? "—",
                    ],
                    [
                      "Grad-CAM",
                      item.gradcam_available
                        ? "Available"
                        : "Not available",
                    ],
                    [
                      "Prediction ID",
                      item.id,
                    ],
                  ].map(([key, value]) => (
                    <div
                      key={key}
                      className="flex min-h-[56px] items-center justify-between gap-4 border-b border-gray-100 px-5 py-3 last:border-0 dark:border-zinc-800 sm:px-6 sm:even:border-l"
                    >
                      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-zinc-500">
                        {key}
                      </span>

                      <span
                        className="max-w-[220px] truncate text-right text-xs font-bold text-gray-800 dark:text-zinc-200"
                        title={String(value)}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ============================================================ */}
              {/* DISCLAIMER                                                   */}
              {/* ============================================================ */}

              <section className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />

                <p className="text-[11px] leading-5 text-amber-900 dark:text-amber-200">
                  <strong>Important:</strong>{" "}
                  Wheat Disease Prediction System provides
                  AI-assisted screening and should not be
                  considered a confirmed agronomic diagnosis.
                  Consult a qualified agricultural expert
                  before applying treatment.
                </p>
              </section>
            </div>
          </main>

          {/* ================================================================ */}
          {/* 10. DOWNLOAD PDF + CLOSE                                         */}
          {/* ================================================================ */}

          <footer className="shrink-0 border-t border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handlePdf}
                disabled={pdfLoading}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-black transition-all",
                  pdfLoading
                    ? "cursor-wait bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500"
                    : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 active:scale-[0.99]"
                )}
              >
                {pdfLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download PDF Report
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-3.5 text-sm font-bold text-gray-700 transition hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
          </footer>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 11. FULLSCREEN IMAGE VIEWER                                        */}
      {/* ================================================================== */}

      {imageExpanded && item.image_url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-3 backdrop-blur-lg sm:p-6"
          onClick={() =>
            setImageExpanded(false)
          }
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen image preview"
        >
          <div
            className="relative flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            {/* Lightbox Header */}

            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-emerald-400" />

                  <p className="truncate text-sm font-black text-white">
                    Analyzed Image
                  </p>
                </div>

                <p className="mt-1 truncate text-[10px] text-zinc-500">
                  {item.filename}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setImageExpanded(false)
                }
                aria-label="Close image viewer"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Fullscreen Image */}

            <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3 sm:p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_url}
                alt={`Wheat leaf — ${item.filename}`}
                className="max-h-[72vh] max-w-full rounded-xl object-contain"
              />
            </div>

            {/* Lightbox Footer */}

            <div className="flex shrink-0 flex-col gap-3 border-t border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
                  Detection Result
                </p>

                <p className="mt-1 text-sm font-black text-white">
                  {diseaseName}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-black",
                    colours.badge
                  )}
                >
                  {severityEmoji(item.severity)}{" "}
                  {item.severity
                    ? item.severity.charAt(0).toUpperCase() +
                      item.severity.slice(1)
                    : "Unknown"}
                </span>

                <span className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-black text-zinc-300">
                  {confidence.toFixed(1)}%
                  {" "}
                  Confidence
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}