"use client";

import {
  formatConfidence,
  getConfidenceTier,
  toConfidencePercent,
} from "@/lib/confidence";

/**
 * Reusable confidence bar.
 *
 * Accepts the raw backend value (0–1 fraction OR 0–100 percent — conversion
 * happens exactly once, inside the shared lib) and renders a proportional
 * bar with tier-based colouring and an optional label. Never invents or
 * rescales a confidence value; it only visualises what the model returned.
 */
export function ConfidenceBar({
  value,
  disease,
  showLabel = false,
  showValue = false,
  trackClass = "bg-slate-100",
  heightClass = "h-2",
  className = "",
}: {
  /** Raw confidence from the API (0–1 or 0–100). */
  value: number;
  /** Predicted disease — enables per-disease Low/Moderate/High grading. */
  disease?: string | null;
  /** Show the tier label ("Low confidence", "High confidence", …). */
  showLabel?: boolean;
  /** Show the formatted percentage above the bar. */
  showValue?: boolean;
  trackClass?: string;
  heightClass?: string;
  className?: string;
}) {
  const tier = getConfidenceTier(value, disease);
  const pct = Math.min(Math.max(toConfidencePercent(value), 0), 100);

  return (
    <div className={className}>
      {showValue && (
        <p className={`mb-1.5 text-[12px] font-bold ${tier.textClass}`}>
          {formatConfidence(value)}
        </p>
      )}

      <div className={`w-full overflow-hidden rounded-full ${trackClass} ${heightClass}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ${tier.barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {showLabel && (
        <p className={`mt-1.5 text-[11px] font-semibold ${tier.textClass}`}>
          {tier.label}
        </p>
      )}
    </div>
  );
}

export default ConfidenceBar;
