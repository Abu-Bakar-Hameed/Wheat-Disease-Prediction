"use client";

/**
 * Feedback popup gating helpers.
 *
 * The SERVER decides whether a login should surface the automatic feedback
 * popup (via `show_feedback` on the login response / an OAuth redirect query
 * param). The browser's ONLY job is to hand that one-shot signal from the
 * login step to the dashboard and to guarantee the popup appears at most once
 * per browser session (spec §19/§20: localStorage/sessionStorage are used
 * solely to prevent duplicate display in the current session — never as the
 * source of truth for eligibility).
 */

const PENDING_KEY = "wg_feedback_prompt_pending";
const SHOWN_KEY = "wg_feedback_prompt_shown";

/** Flag that a just-completed login earned a feedback prompt. */
export function markFeedbackPromptPending(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_KEY, "1");
    // A brand-new login always re-arms the popup, even if it already showed
    // earlier in this same tab. sessionStorage survives reloads AND logout, so
    // without clearing this the SHOWN flag would suppress every later login.
    sessionStorage.removeItem(SHOWN_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Read-and-clear the pending flag. Returns true exactly once per login so the
 * popup opens but never re-opens on navigation/refresh within the session.
 */
export function consumeFeedbackPromptPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const pending = sessionStorage.getItem(PENDING_KEY) === "1";
    if (pending) sessionStorage.removeItem(PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}

/** True once the popup has been shown in this browser session. */
export function wasPromptedThisSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Record that the popup was shown, suppressing any re-display this session. */
export function markPromptedThisSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SHOWN_KEY, "1");
  } catch {
    /* ignore */
  }
}
