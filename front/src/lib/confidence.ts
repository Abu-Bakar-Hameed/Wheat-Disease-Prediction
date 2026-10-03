/**
 * WheatGuard — shared confidence presentation utilities.
 *
 * Confidence values ALWAYS come from the backend model output (softmax
 * probability). This module only normalises, formats and assigns visual
 * tiers — it never scales, boosts or fabricates a value.
 */

/**
 * Normalise a confidence value to a 0–1 fraction regardless of whether the
 * API sent a fraction (0.94) or a percentage (94). Conversion happens exactly
 * once here — callers must not pre-convert (avoids the 0.273 → 27.3 → 2730%
 * double-conversion bug).
 */
export function normalizeConfidence(raw: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  const fraction = value > 1 ? value / 100 : value;
  return Math.min(Math.max(fraction, 0), 1);
}

/** Confidence as a 0–100 percentage number, clamped. */
export function toConfidencePercent(raw: number): number {
  return normalizeConfidence(raw) * 100;
}

/** e.g. formatConfidence(0.718) → "71.8%" */
export function formatConfidence(raw: number, digits = 1): string {
  return `${toConfidencePercent(raw).toFixed(digits)}%`;
}

export type ConfidenceTierKey = "veryHigh" | "high" | "moderate" | "low";

export interface ConfidenceTier {
  key: ConfidenceTierKey;
  /** UI label, e.g. "Low confidence". */
  label: string;
  /** Tailwind bg-* for bar fills. */
  barClass: string;
  /** Tailwind stroke-* for SVG rings. */
  strokeClass: string;
  /** Matching text colour. */
  textClass: string;
}

/**
 * Per-disease confidence boundaries (as 0–1 fractions).
 *
 * Each disease class defines where "Moderate" starts and where "High" starts;
 * anything below the moderate boundary is "Low". These reflect how reliably the
 * model distinguishes each specific disease — rusts/mildew/septoria are graded
 * a little more leniently (≥55% moderate, ≥80% high) while Healthy, Stem Rust
 * and Fusarium Head Blight need more certainty (≥60% moderate, ≥85% high).
 *
 * Keys are matched case-insensitively after normalising whitespace. Aliases
 * (e.g. "Brown Rust" == "Leaf Rust") are included so model class names and
 * display names both resolve.
 */
export interface ConfidenceThresholds {
  /** Lower bound of the Moderate band (below this is Low). */
  moderate: number;
  /** Lower bound of the High band. */
  high: number;
}

export const DISEASE_CONFIDENCE_TIERS: Record<string, ConfidenceThresholds> = {
  healthy: { moderate: 0.6, high: 0.85 },
  "stem rust": { moderate: 0.6, high: 0.85 },
  "fusarium head blight": { moderate: 0.6, high: 0.85 },
  "leaf rust": { moderate: 0.55, high: 0.8 },
  "brown rust": { moderate: 0.55, high: 0.8 }, // leaf rust == brown rust
  "yellow rust": { moderate: 0.55, high: 0.8 },
  "powdery mildew": { moderate: 0.55, high: 0.8 },
  "septoria leaf blotch": { moderate: 0.55, high: 0.8 },
  septoria: { moderate: 0.55, high: 0.8 },
  "tan spot": { moderate: 0.55, high: 0.8 },
};

function normaliseDiseaseKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Resolve the Low/Moderate/High thresholds for a disease, if one is defined. */
export function getDiseaseThresholds(
  disease?: string | null
): ConfidenceThresholds | undefined {
  if (!disease) return undefined;
  return DISEASE_CONFIDENCE_TIERS[normaliseDiseaseKey(disease)];
}

const VERY_HIGH_TIER: ConfidenceTier = {
  key: "veryHigh",
  label: "Very high confidence",
  barClass: "bg-emerald-600",
  strokeClass: "stroke-emerald-600",
  textClass: "text-emerald-700 dark:text-emerald-400",
};
const HIGH_TIER: ConfidenceTier = {
  key: "high",
  label: "High confidence",
  barClass: "bg-emerald-500",
  strokeClass: "stroke-emerald-500",
  textClass: "text-emerald-600 dark:text-emerald-400",
};
const MODERATE_TIER: ConfidenceTier = {
  key: "moderate",
  label: "Moderate confidence",
  barClass: "bg-amber-500",
  strokeClass: "stroke-amber-500",
  textClass: "text-amber-600 dark:text-amber-400",
};
const LOW_TIER: ConfidenceTier = {
  key: "low",
  label: "Low confidence",
  barClass: "bg-orange-500",
  strokeClass: "stroke-orange-500",
  textClass: "text-orange-600 dark:text-orange-400",
};

/**
 * Visual tiering for confidence.
 *
 * When a `disease` is supplied and has an entry in DISEASE_CONFIDENCE_TIERS,
 * the Low/Moderate/High bands are graded against that disease's specific
 * thresholds. Otherwise it falls back to the project's global 0.80 / 0.50
 * scale (with an extra ≥ 0.90 "very high" tier). Red is deliberately NOT used
 * — red stays reserved for disease severity/risk signalling, so a
 * low-confidence prediction never reads as a critical disease. These labels
 * describe model certainty only, not real-world scientific accuracy.
 */
export function getConfidenceTier(
  raw: number,
  disease?: string | null
): ConfidenceTier {
  const c = normalizeConfidence(raw);
  const t = getDiseaseThresholds(disease);

  if (t) {
    if (c >= t.high) return c >= 0.9 ? VERY_HIGH_TIER : HIGH_TIER;
    if (c >= t.moderate) return MODERATE_TIER;
    return LOW_TIER;
  }

  if (c >= 0.9) return VERY_HIGH_TIER;
  if (c >= 0.8) return HIGH_TIER;
  if (c >= 0.5) return MODERATE_TIER;
  return LOW_TIER;
}
