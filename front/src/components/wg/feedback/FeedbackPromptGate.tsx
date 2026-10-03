"use client";

/**
 * FeedbackPromptGate — mounted once in the user dashboard layout.
 *
 * Popup-only feedback: when a login just happened we stash a one-shot flag
 * (see lib/feedbackPrompt.ts). On mount we consume that flag and surface the
 * feedback popup right away — grab the review and carry on. There is no
 * dedicated feedback page; this modal is the whole experience. It fires
 * identically for email/password and Google/Microsoft logins, at most once per
 * browser session (a refresh of an already-shown session won't re-arm it).
 */

import { useEffect, useState } from "react";
import { FeedbackModal } from "./FeedbackModal";
import { fetchFeedbackMeta, type FeedbackMeta } from "@/lib/feedbackApi";
import { FEEDBACK_TYPES } from "@/types";
import {
  consumeFeedbackPromptPending,
  markPromptedThisSession,
  wasPromptedThisSession,
} from "@/lib/feedbackPrompt";

export function FeedbackPromptGate() {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<FeedbackMeta>({ types: [], require_rating: false });

  useEffect(() => {
    // Open right after login: only when this browser session began with a fresh
    // login (consume… clears the one-shot flag so a plain refresh won't re-show
    // it) and we haven't already popped the dialog this session.
    if (!consumeFeedbackPromptPending() || wasPromptedThisSession()) return;

    markPromptedThisSession();
    // Defer one microtask so we don't call setState synchronously in the effect
    // body (react-hooks/set-state-in-effect); the popup still opens right away.
    void Promise.resolve().then(() => setOpen(true));
    fetchFeedbackMeta().then(setMeta).catch(() => {
      /* keep sensible defaults if meta can't load */
    });
  }, []);

  if (!open) return null;

  return (
    <FeedbackModal
      requireRating={meta.require_rating}
      types={meta.types.length ? meta.types : FEEDBACK_TYPES}
      showType={false}
      onClose={() => setOpen(false)}
    />
  );
}
