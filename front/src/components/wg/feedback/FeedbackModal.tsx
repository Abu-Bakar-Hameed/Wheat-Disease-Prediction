"use client";

/**
 * FeedbackModal — the friendly, themed popup surfaced automatically after a
 * qualifying login (and reusable as the "new feedback" dialog on the page).
 *
 * Locks body scroll, closes on Escape / backdrop, and never forces a response:
 * [Maybe Later] and the ✕ dismiss without submitting.
 */

import { useEffect, useState, type ReactNode } from "react";
import { FeedbackForm } from "./FeedbackForm";
import { FEEDBACK_TYPES } from "@/types";

export function FeedbackModal({
  title = "We'd Love Your Feedback",
  subtitle = "Quickly tell us how your experience with WheatGuard AI has been.",
  requireRating = false,
  types = FEEDBACK_TYPES as unknown as string[],
  showType = false,
  defaultType = "General Feedback",
  submitLabel = "Submit Feedback",
  secondaryLabel = "Maybe Later",
  icon = "rate_review",
  onClose,
  onSubmitted,
  context,
  children,
}: {
  title?: string;
  subtitle?: string;
  requireRating?: boolean;
  types?: readonly string[];
  showType?: boolean;
  defaultType?: string;
  submitLabel?: string;
  secondaryLabel?: string;
  icon?: string;
  onClose: () => void;
  onSubmitted?: (ticket: string) => void;
  context?: Partial<{ conversation_id: string; message_id: string; provider: string; model: string }>;
  children?: ReactNode;
}) {
  const [done, setDone] = useState(false);

  // Body scroll lock + Escape to close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", h); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-brand-900 to-brand-700 px-6 pt-6 pb-12 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 p-1.5 rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
          <h3 className="text-[18px] font-bold">{title}</h3>
          <p className="text-[12.5px] text-white/80 mt-1 leading-relaxed">{subtitle}</p>
        </div>

        {/* Floated card body */}
        <div className="px-6 pb-6 -mt-6">
          <div className="rounded-2xl border border-line bg-white shadow-sm p-5">
            <div className="flex items-center justify-center -mt-[52px] mb-3">
              <div className="h-14 w-14 rounded-2xl bg-brand-700 text-white flex items-center justify-center shadow-lg ring-4 ring-white">
                <span className="material-symbols-outlined" style={{ fontSize: 26 }}>{icon}</span>
              </div>
            </div>

            {done ? (
              <div className="py-4 text-center space-y-3">
                <div className="mx-auto h-12 w-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
                  <span className="material-symbols-outlined" style={{ fontSize: 26 }}>check</span>
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-ink">Thank you!</p>
                  <p className="text-[12.5px] text-muted mt-1">
                    Your feedback helps us make WheatGuard AI better for every researcher.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full px-4 py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold hover:bg-brand-800 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <FeedbackForm
                requireRating={requireRating}
                types={types}
                showType={showType}
                defaultType={defaultType}
                submitLabel={submitLabel}
                secondaryLabel={secondaryLabel}
                onSecondary={onClose}
                onSubmitted={(ticket) => { setDone(true); onSubmitted?.(ticket); }}
                context={context}
              />
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
