"use client";

/**
 * Security & Account (Settings → Security & Account).
 *
 * Every control here is REAL and wired to a backend:
 *   • Change password   → POST /users/me/change-password (relay + revocation).
 *   • Change email       → POST /users/me/change-email     (re-verifies password,
 *                          invalidates all sessions).
 *   • Two-factor (TOTP)  → /users/me/2fa/{setup,enable,disable}; enforced at
 *                          sign-in by the auth service.
 *   • Active sessions    → GET  /users/me/sessions (recent sign-in activity).
 *   • Sign out everywhere→ POST /users/me/sign-out-all (token invalidation).
 *   • Delete account     → POST /users/me/delete-account (cascades all data).
 *
 * Password/email changes and account deletion revoke the current token, so the
 * caller is signed out afterwards (the message says so).
 */

import { useCallback, useEffect, useState } from "react";
import {
  changeUserPassword,
  changeUserEmail,
  deleteAccount,
  signOutEverywhere,
  fetchLoginSessions,
  fetchUserSettings,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  type LoginSession,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSettingsFormat } from "@/lib/settingsFormat";
import { Banner, SectionIntro, getErrorMessage } from "./shared";

type Status = { type: "success" | "error"; msg: string } | null;

export function SecuritySection() {
  const { signOut } = useAuth();
  const { formatDateTime } = useSettingsFormat();

  const [status, setStatus] = useState<Status>(null);
  const field =
    "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/60 transition";
  const btnPrimary =
    "inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60";
  const btnDanger =
    "shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70";
  const btnGhost =
    "shrink-0 rounded-xl border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-60";

  /* ── Password ─────────────────────────────────────────────────────────── */
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const canSubmitPw = current.length > 0 && next.length >= 8 && next === confirm;

  const handleSubmitPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitPw) {
      if (next.length < 8) setStatus({ type: "error", msg: "New password must be at least 8 characters." });
      else if (next !== confirm) setStatus({ type: "error", msg: "New passwords do not match." });
      return;
    }
    setSavingPw(true);
    setStatus(null);
    try {
      await changeUserPassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      // The change revoked every token, so sign the local session out too.
      setStatus({ type: "success", msg: "Password changed. Please sign in again." });
      await signOut();
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setSavingPw(false);
    }
  };

  /* ── Change email ─────────────────────────────────────────────────────── */
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !emailPw) return;
    setSavingEmail(true);
    setStatus(null);
    try {
      await changeUserEmail({ newEmail: newEmail.trim(), currentPassword: emailPw });
      setNewEmail("");
      setEmailPw("");
      setStatus({ type: "success", msg: "Email updated. Please sign in again with your new email." });
      await signOut();
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setSavingEmail(false);
    }
  };

  /* ── Two-factor authentication ────────────────────────────────────────── */
  const [twofaEnabled, setTwofaEnabled] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy2fa, setBusy2fa] = useState(false);

  useEffect(() => {
    fetchUserSettings()
      .then((s) => setTwofaEnabled(s.two_factor_enabled === true))
      .catch(() => {});
  }, []);

  const startTwoFactor = async () => {
    setBusy2fa(true);
    setStatus(null);
    try {
      const res = await setupTwoFactor();
      setSetup({ secret: res.secret, otpauth_uri: res.otpauth_uri });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setBusy2fa(false);
    }
  };

  const confirmTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, "").length < 6) {
      setStatus({ type: "error", msg: "Enter the 6-digit code from your app." });
      return;
    }
    setBusy2fa(true);
    setStatus(null);
    try {
      await enableTwoFactor(code);
      setTwofaEnabled(true);
      setSetup(null);
      setCode("");
      setStatus({ type: "success", msg: "Two-factor authentication is on." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setBusy2fa(false);
    }
  };

  const turnOffTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, "").length < 6) {
      setStatus({ type: "error", msg: "Enter a current code to turn two-factor off." });
      return;
    }
    setBusy2fa(true);
    setStatus(null);
    try {
      await disableTwoFactor(code);
      setTwofaEnabled(false);
      setSetup(null);
      setCode("");
      setStatus({ type: "success", msg: "Two-factor authentication is off." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setBusy2fa(false);
    }
  };

  /* ── Active sessions ──────────────────────────────────────────────────── */
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const loadSessions = useCallback(() => {
    setLoadingSessions(true);
    fetchLoginSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, []);

  useEffect(() => {
    // Initial load. Kept async-only (state is set in the promise callbacks, not
    // synchronously) so we don't trigger a cascading render from the effect body.
    let cancelled = false;
    fetchLoginSessions()
      .then((s) => { if (!cancelled) setSessions(s); })
      .catch(() => { if (!cancelled) setSessions([]); })
      .finally(() => { if (!cancelled) setLoadingSessions(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSignOutEverywhere = async () => {
    if (!window.confirm("End every signed-in session on all devices? You'll need to sign in again.")) return;
    setSigningOutAll(true);
    setStatus(null);
    try {
      await signOutEverywhere();
      setStatus({ type: "success", msg: "All sessions ended. Please sign in again." });
      await signOut();
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setSigningOutAll(false);
    }
  };

  /* ── Delete account ───────────────────────────────────────────────────── */
  const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false);

  const handleDeleteAccount = async () => {
    if (!delPw) {
      setStatus({ type: "error", msg: "Enter your password to confirm deletion." });
      return;
    }
    if (
      !window.confirm(
        "Permanently delete your account and ALL your data? This cannot be undone."
      )
    ) {
      return;
    }
    setDelBusy(true);
    setStatus(null);
    try {
      await deleteAccount({ password: delPw });
      setStatus({ type: "success", msg: "Your account has been deleted." });
      await signOut();
      // Account is gone — leave the dashboard entirely and land on the public home page.
      window.location.replace("/");
      return;
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
      setDelBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Password */}
      <section className="space-y-1">
        <SectionIntro
          title="Password"
          description="Change the password you use to sign in. Changing it signs you out everywhere."
        />
        <form onSubmit={handleSubmitPw} className="space-y-3 pt-1">
          <div>
            <label htmlFor="sec-current" className="mb-1.5 block text-[13px] font-medium text-ink">
              Current password
            </label>
            <input id="sec-current" type="password" autoComplete="current-password" value={current}
              onChange={(e) => setCurrent(e.target.value)} className={field} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sec-new" className="mb-1.5 block text-[13px] font-medium text-ink">
                New password
              </label>
              <input id="sec-new" type="password" autoComplete="new-password" value={next}
                onChange={(e) => setNext(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="sec-confirm" className="mb-1.5 block text-[13px] font-medium text-ink">
                Confirm new password
              </label>
              <input id="sec-confirm" type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className={field} />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={savingPw || !canSubmitPw} className={btnPrimary}>
              {savingPw && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {savingPw ? "Updating…" : "Change password"}
            </button>
          </div>
        </form>
      </section>

      {/* Email */}
      <section className="space-y-1">
        <SectionIntro
          title="Sign-in email"
          description="Update the email you sign in with. You'll confirm with your current password and be signed out."
        />
        <form onSubmit={handleSubmitEmail} className="space-y-3 pt-1">
          <div>
            <label htmlFor="sec-email" className="mb-1.5 block text-[13px] font-medium text-ink">
              New email address
            </label>
            <input id="sec-email" type="email" autoComplete="email" value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" className={field} />
          </div>
          <div>
            <label htmlFor="sec-email-pw" className="mb-1.5 block text-[13px] font-medium text-ink">
              Current password
            </label>
            <input id="sec-email-pw" type="password" autoComplete="current-password" value={emailPw}
              onChange={(e) => setEmailPw(e.target.value)} className={field} />
          </div>
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={savingEmail || !newEmail.trim() || !emailPw} className={btnPrimary}>
              {savingEmail && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {savingEmail ? "Updating…" : "Change email"}
            </button>
          </div>
        </form>
      </section>

      {/* Two-factor */}
      <section className="space-y-2">
        <SectionIntro
          title="Two-factor authentication"
          description="Require a 6-digit code from an authenticator app when you sign in."
        />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">
              Status:{" "}
              <span className={twofaEnabled ? "text-emerald-700 dark:text-emerald-300" : "text-muted"}>
                {twofaEnabled ? "On" : "Off"}
              </span>
            </p>
            <p className="text-[12px] text-muted mt-0.5">
              {twofaEnabled
                ? "Your account is protected with an authenticator app."
                : "Turn this on to add a second step at sign-in."}
            </p>
          </div>
          {!twofaEnabled && !setup && (
            <button type="button" onClick={startTwoFactor} disabled={busy2fa} className={btnGhost}>
              {busy2fa ? "Preparing…" : "Set up"}
            </button>
          )}
        </div>

        {/* Enrolment: show secret + URI, confirm with a code */}
        {setup && !twofaEnabled && (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
            <p className="text-[12px] text-muted">
              Add this key to your authenticator app (Google Authenticator, Authy, 1Password), then enter the
              6-digit code it generates to confirm.
            </p>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Setup key</p>
              <p className="mt-0.5 break-all font-mono text-[13px] text-ink">{setup.secret}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Or open this link</p>
              <a href={setup.otpauth_uri} className="mt-0.5 block break-all text-[12px] text-emerald-700 underline dark:text-emerald-300">
                {setup.otpauth_uri}
              </a>
            </div>
            <form onSubmit={confirmTwoFactor} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={field + " sm:max-w-[160px]"}
              />
              <button type="submit" disabled={busy2fa} className={btnPrimary}>
                {busy2fa ? "Verifying…" : "Verify & enable"}
              </button>
            </form>
          </div>
        )}

        {/* Turn off */}
        {twofaEnabled && (
          <form onSubmit={turnOffTwoFactor} className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter current code to disable"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={field + " sm:max-w-[220px]"}
            />
            <button type="submit" disabled={busy2fa} className={btnDanger}>
              {busy2fa ? "Working…" : "Turn off"}
            </button>
          </form>
        )}
      </section>

      {/* Active sessions */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <SectionIntro
            title="Recent sign-in activity"
            description="The devices your account has recently signed in from."
          />
          <button type="button" onClick={loadSessions} className={btnGhost}>
            Refresh
          </button>
        </div>
        <div className="space-y-2">
          {loadingSessions ? (
            <p className="rounded-xl bg-surface-muted px-4 py-3 text-[13px] text-muted">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="rounded-xl bg-surface-muted px-4 py-3 text-[13px] text-muted">
              No recent sign-in activity found.
            </p>
          ) : (
            sessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{s.device || "Unknown device"}</p>
                  <p className="text-[12px] text-muted">
                    {s.when ? formatDateTime(s.when) : "—"}
                    {s.ip ? ` · ${s.ip}` : ""}
                    {s.method ? ` · via ${s.method}` : ""}
                  </p>
                </div>
                {i === 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300">
                    Current
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end pt-1">
          <button type="button" onClick={handleSignOutEverywhere} disabled={signingOutAll} className={btnDanger}>
            {signingOutAll ? "Signing out…" : "Sign out everywhere"}
          </button>
        </div>
      </section>

      {/* Delete account */}
      <section className="space-y-2">
        <SectionIntro
          title="Delete account"
          description="Permanently remove your account, all predictions, reminders and stored images. This cannot be undone."
        />
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 px-4 py-3 dark:border-red-800/50 dark:bg-red-950/30">
          <label htmlFor="sec-del-pw" className="block text-[13px] font-medium text-ink">
            Confirm with your password
          </label>
          <input id="sec-del-pw" type="password" autoComplete="current-password" value={delPw}
            onChange={(e) => setDelPw(e.target.value)} className={field} />
          <div className="flex justify-end pt-1">
            <button type="button" onClick={handleDeleteAccount} disabled={delBusy || !delPw} className={btnDanger}>
              {delBusy ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </div>
      </section>

      {status && <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />}
    </div>
  );
}
