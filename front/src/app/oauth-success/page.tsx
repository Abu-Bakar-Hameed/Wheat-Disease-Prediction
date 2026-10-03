"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markFeedbackPromptPending } from "@/lib/feedbackPrompt";

const AUTH_STEPS = ["Verifying your account", "Securing your session", "Loading your dashboard"];

export default function OAuthSuccessPage() {
  const router = useRouter();
  // Visual-only state — none of this touches the auth flow below.
  const [visibleSteps, setVisibleSteps] = useState(1);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email") || "";
    const name = params.get("name") || "WheatGuard User";
    const userId = params.get("userId") || "oauth-user";
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const expiresIn = params.get("expiresIn") || "7d";
    const errorParam = params.get("error");

    // If the backend didn't hand back real tokens, don't fabricate a
    // fake session — bounce to login with an error instead.
    if (errorParam || !accessToken) {
      setFailed(errorParam || "We didn't receive a valid sign-in response. Please try again.");
      timersRef.current.push(window.setTimeout(() => {
        window.location.href = "/login?error=oauth_no_token";
      }, 3500));
      return;
    }

    const sessionRecord = {
      accessToken,
      refreshToken: refreshToken || "",
      tokenType: "Bearer",
      expiresIn,
    };

    const userRecord = {
      id: userId,
      email,
      name,
      role: "user",
      organizationName: "WheatGuard",
      emailVerified: true,
    };

    try {
      localStorage.setItem("wg_backend_session", JSON.stringify(sessionRecord));
      localStorage.setItem("wg_backend_user", JSON.stringify(userRecord));
      // Same one-shot popup signal the email/password login sets, so Google /
      // Microsoft logins behave identically: popup-only feedback armed 3 minutes
      // after this login (see lib/feedbackPrompt.ts + FeedbackPromptGate).
      markFeedbackPromptPending();
    } catch {
      // ignore storage failures (e.g. private browsing mode)
    }

    // Go straight to the panel — never back to the landing page.
    window.location.href = "/dashboard";
  }, []);

  // Stagger the three status lines (700ms apart) + 10s "taking longer" hint.
  useEffect(() => {
    if (failed) return;
    timersRef.current.push(
      window.setTimeout(() => setVisibleSteps(2), 700),
      window.setTimeout(() => setVisibleSteps(3), 1400),
      window.setTimeout(() => setSlow(true), 10000)
    );
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, [failed]);

  return (
    <main
      role="status"
      aria-live="polite"
      className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-5 dark:bg-brand-950"
    >
      {/* Soft radial glow behind the centre */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,var(--color-brand-100),transparent_60%)] opacity-60 dark:opacity-15"
      />
      {/* Faint leaf pattern, bottom-right corner */}
      <span
        aria-hidden
        className="material-symbols-outlined pointer-events-none absolute -bottom-10 -right-10 select-none text-[190px] leading-none text-brand-800 opacity-5 dark:text-brand-100"
      >
        forest
      </span>

      <div className="relative w-full max-w-sm text-center">
        {failed ? (
          /* ── Error state — same layout, red-tinted ── */
          <>
            <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-red-100 dark:bg-red-500/15">
              <span className="material-symbols-outlined text-[34px] text-red-600 dark:text-red-400" aria-hidden>
                cloud_off
              </span>
            </div>
            <h1 className="mt-6 text-xl font-semibold text-neutral-900 dark:text-zinc-100">
              Couldn&apos;t sign you in
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-zinc-400">{failed}</p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-800 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden>
                arrow_back
              </span>
              Try again
            </button>
          </>
        ) : (
          /* ── Loading state ── */
          <>
            {/* Logo with rotating progress ring around it */}
            <div className="relative mx-auto h-[112px] w-[112px]">
              <span
                aria-hidden
                className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand-400 [animation-duration:1.1s]"
              />
              <div className="absolute inset-[14px] flex items-center justify-center rounded-full bg-brand-700 shadow-sm">
                <span className="material-symbols-outlined text-[34px] text-white" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden>
                  eco
                </span>
              </div>
            </div>

            <h1 className="mt-6 text-xl font-semibold text-neutral-900 dark:text-zinc-100">
              Signing you in
              <span className="wg-animated-dots inline-flex w-6 justify-start gap-0.5" aria-hidden>
                <span>.</span><span>.</span><span>.</span>
              </span>
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-zinc-400">
              Completing secure authentication with WheatGuard AI.
            </p>

            {/* Indeterminate progress bar */}
            <div className="mt-6 h-1 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900">
              <div className="wg-progress-slide h-full rounded-full bg-brand-600" />
            </div>
            {slow && (
              <p className="mt-3 text-sm text-neutral-600 dark:text-zinc-400">
                This is taking longer than usual.{" "}
                <button
                  type="button"
                  onClick={() => router.replace("/login")}
                  className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-600 dark:text-brand-300"
                >
                  Back to sign in
                </button>
              </p>
            )}

            {/* Status lines appearing one after another */}
            <ul className="mx-auto mt-6 w-fit space-y-2 text-left">
              {AUTH_STEPS.map((label, i) => {
                const done = i + 1 < visibleSteps;
                const visible = i + 1 <= visibleSteps;
                return (
                  <li
                    key={label}
                    aria-hidden={!visible}
                    className={`flex items-center gap-2 text-sm transition-opacity duration-500 ${
                      visible ? "opacity-100" : "opacity-0"
                    } ${done ? "text-neutral-600 dark:text-zinc-400" : "text-neutral-900 dark:text-zinc-100"}`}
                  >
                    {done ? (
                      <span className="material-symbols-outlined text-[16px] text-brand-600 dark:text-brand-400" aria-hidden>
                        check_circle
                      </span>
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center" aria-hidden>
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                      </span>
                    )}
                    {label}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Bottom trust line */}
      <p className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1.5 text-xs text-neutral-500 dark:text-zinc-500">
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          shield
        </span>
        Secure, encrypted authentication
      </p>
    </main>
  );
}
