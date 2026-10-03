"use client";

import { cn } from "@/lib/utils";

/**
 * Password strength evaluation shared by the meter and the register form.
 * Returns a 0–4 score plus the label the form shows to the user.
 */
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

export function evaluatePassword(value: string): PasswordStrength {
  if (!value) return { score: 0, label: "" };

  let hits = 0;
  if (value.length >= 8) hits += 1;
  if (/\d/.test(value)) hits += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) hits += 1;
  if (/[^A-Za-z0-9]/.test(value)) hits += 1;

  // Very short passwords never read as strong, regardless of character variety.
  if (value.length < 8) hits = Math.min(hits, 1);

  const score = Math.max(0, Math.min(4, hits)) as PasswordStrength["score"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"] as const;
  return { score, label: labels[score] };
}

const BAR_COLORS = [
  "bg-line",
  "bg-danger",
  "bg-wheat-500",
  "bg-brand-500",
  "bg-brand-700",
];

const LABEL_COLORS = [
  "text-muted",
  "text-danger",
  "text-[#b45309]",
  "text-brand-600",
  "text-brand-800",
];

/**
 * Four-bar strength meter with a short hint. Purely presentational — it takes
 * the current password and reports how strong it looks.
 */
export function StrengthMeter({
  password,
  hint = "Use 8+ characters with a number",
}: {
  password: string;
  hint?: string;
}) {
  const { score, label } = evaluatePassword(password);

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-200",
              bar <= score ? BAR_COLORS[score] : "bg-line"
            )}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">{hint}</p>
        {label && (
          <p
            className={cn(
              "text-[11px] font-semibold",
              LABEL_COLORS[score]
            )}
            aria-live="polite"
          >
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
