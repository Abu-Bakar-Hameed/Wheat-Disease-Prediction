"use client";

/**
 * FeedbackForm — the shared feedback composer used by BOTH the dedicated
 * Feedback page and the automatic login popup.
 *
 * Fields (spec §4/§5): star rating (1 Very Bad … 5 Excellent; optional unless
 * configured required), a feedback-type dropdown, and a message box. Renders
 * its own footer buttons so the popup can show "Maybe Later" while the page
 * shows "Cancel". Guards double-submits by disabling while busy.
 */

import { useState } from "react";
import type { CreateFeedbackPayload } from "@/lib/feedbackApi";
import { submitFeedback } from "@/lib/feedbackApi";
import { FEEDBACK_TYPES } from "@/types";

const RATING_LABELS: Record<number, string> = {
  1: "Very Bad",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

/* The feedback message is capped at 50 words. */
const MAX_WORDS = 50;

/** Count whitespace-separated words in a message (0 for empty/whitespace). */
function countWords(text: string): string[] {
  const t = text.trim();
  return t ? t.split(/\s+/) : [];
}

/* ── Interactive star rating ─────────────────────────────────────────────── */
export function StarRating({
  value,
  onChange,
  size = 30,
  readOnly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => !readOnly && setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= active;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => !readOnly && setHover(n)}
            onClick={() => !readOnly && onChange?.(n === value ? 0 : n)}
            className={`transition-transform ${readOnly ? "cursor-default" : "cursor-pointer hover:scale-110"} ${
              filled ? "text-[#f59e0b]" : "text-line"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: size, fontVariationSettings: "'FILL' 1" }}>
              {filled ? "star" : "star_border"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Read-only compact rating (history rows) ─────────────────────────────── */
export function RatingInline({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-[12px] text-muted">No rating</span>;
  return (
    <span className="inline-flex items-center gap-0.5 text-[#f59e0b]" title={RATING_LABELS[rating]}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="material-symbols-outlined" style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}>
          {n <= rating ? "star" : "star_border"}
        </span>
      ))}
    </span>
  );
}

export function ratingLabel(rating: number | null): string {
  return rating ? RATING_LABELS[rating] ?? "" : "No rating";
}

/* ── The composer ────────────────────────────────────────────────────────── */
export function FeedbackForm({
  requireRating = false,
  types = FEEDBACK_TYPES as unknown as string[],
  defaultType = "",
  showType = true,
  submitLabel = "Submit Feedback",
  secondaryLabel = "Cancel",
  onSecondary,
  onSubmitted,
  context,
}: {
  requireRating?: boolean;
  types?: readonly string[];
  defaultType?: string;
  showType?: boolean;
  submitLabel?: string;
  secondaryLabel?: string;
  onSecondary: () => void;
  /** Called after a successful submission (with the created row). */
  onSubmitted?: (ticket: string) => void;
  /** Optional chatbot context to attach (message thumbs-up/down flow). */
  context?: Partial<Pick<CreateFeedbackPayload, "conversation_id" | "message_id" | "provider" | "model">>;
}) {
  const [type, setType] = useState<string>(
    () => defaultType || types[0] || "General Feedback"
  );
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const wordCount = countWords(message).length;
  const canSubmit = message.trim().length >= 3 && (!requireRating || rating > 0) && !busy;

  const doSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    try {
      const created = await submitFeedback({
        type,
        rating: rating || null,
        message: message.trim(),
        ...context,
      });
      onSubmitted?.(created.ticket);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't submit your feedback. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {showType && (
        <div>
          <label className="block text-[12px] font-semibold text-ink mb-1.5">Feedback type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-line text-[14px] outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10 bg-white"
          >
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-[12px] font-semibold text-ink mb-1.5">
          Your rating {requireRating ? <span className="text-danger">*</span> : <span className="font-normal text-muted">(optional)</span>}
        </label>
        <div className="flex items-center gap-3">
          <StarRating value={rating} onChange={setRating} />
          <span className="text-[12px] text-muted min-w-[70px]">
            {rating ? RATING_LABELS[rating] : "Tap a star"}
          </span>
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-ink mb-1.5">
          {showType ? "Tell us more" : "What can we improve?"} <span className="text-danger">*</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => {
            const v = e.target.value;
            const w = countWords(v);
            // Hard cap at 50 words — also trims oversized pastes.
            setMessage(w.length > MAX_WORDS ? w.slice(0, MAX_WORDS).join(" ") : v);
          }}
          rows={4}
          placeholder="Share your thoughts, ideas or issues…"
          className="w-full px-3 py-2.5 rounded-lg border border-line text-[14px] outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10 resize-none max-h-52"
        />
        <div className="flex justify-end">
          <span className="text-[11px] text-muted">{wordCount}/{MAX_WORDS} words</span>
        </div>
      </div>

      {err && (
        <div className="px-3 py-2 rounded-lg bg-danger-soft text-danger text-[12px] border border-[#fca5a5]">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onSecondary}
          disabled={busy}
          className="px-4 py-2 rounded-lg border border-line text-[13px] text-ink hover:bg-surface-muted disabled:opacity-50 transition-colors"
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          onClick={() => void doSubmit()}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold hover:bg-brand-800 disabled:opacity-50 transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>send</span>
          {busy ? "Submitting…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
