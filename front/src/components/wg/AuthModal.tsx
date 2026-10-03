"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { StrengthMeter } from "@/components/wg/auth/StrengthMeter";
import { OtpInput } from "@/components/wg/auth/OtpInput";
import { EmailField } from "@/components/wg/auth/EmailField";
import { useScrollLock } from "@/lib/useScrollLock";

/** Small inline spinner shown on submit buttons while a request is in flight. */
function Spinner({ className = "text-white" }: { className?: string }) {
  return (
    <span
      className={cn("material-symbols-outlined animate-spin", className)}
      style={{ fontSize: 18 }}
      aria-hidden
    >
      progress_activity
    </span>
  );
}

export type AuthMode =
  | "user-login"
  | "admin-login"
  | "register"
  | "verify-otp"
  | "forgot-password"
  | "verify-reset-otp"
  | "reset-password";

const AFFILIATION_OPTIONS = [
  "Commercial Grain Farmer",
  "Field Agronomist / Consultant",
  "Cereal Crop Pathologist",
  "Agricultural Cooperative Manager",
  "Plant Health Inspector",
  "Agricultural Researcher",
];

/** The three top-level tabs shown on the sign in / register / admin screens. */
const INLINE_TABS = [
  ["user-login", "Sign in"],
  ["register", "Create account"],
  ["admin-login", "Admin"],
] as const;

export function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function Field({
  label,
  icon,
  type = "text",
  value,
  onChange,
  placeholder,
  required = true,
}: {
  label: string;
  icon: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-ink">
        {label}
      </label>

      <div className="relative">
        <span
          className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          style={{ fontSize: 18 }}
        >
          {icon}
        </span>

        <input
          type={type}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-line bg-surface pl-10 pr-3 text-[13px] text-ink outline-none transition-all placeholder:text-muted/70"
        />
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  setShow,
  placeholder = "Enter password",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  setShow: (value: boolean) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-ink">
        {label}
      </label>

      <div className="relative">
        <span
          className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          style={{ fontSize: 18 }}
        >
          lock
        </span>

        <input
          type={show ? "text" : "password"}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-line bg-surface pl-10 pr-11 text-[13px] text-ink outline-none transition-all placeholder:text-muted/70"
        />

        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {show ? "visibility_off" : "visibility"}
          </span>
        </button>
      </div>
    </div>
  );
}

function AuthBrandPanel() {
  return (
    <div className="relative hidden w-[340px] shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-8 text-white lg:flex">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/30 blur-3xl"
        aria-hidden
      />
      <div className="relative flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
          <span
            className="material-symbols-outlined text-brand-100"
            style={{ fontSize: 22 }}
          >
            eco
          </span>
        </div>
        <span className="text-lg font-bold tracking-tight">WheatGuard AI</span>
      </div>

      <div className="relative space-y-5">
        <h3 className="text-[22px] font-extrabold leading-snug">
          Precision wheat disease detection, powered by Vision AI.
        </h3>
        <ul className="space-y-3 text-sm text-white/85">
          {[
            { icon: "bolt", text: "Sub-second ResNet-50 + ViT inference" },
            { icon: "biotech", text: "Lab-grade diagnostic confidence" },
            { icon: "cloud", text: "Weather-aware disease risk alerts" },
          ].map((f) => (
            <li key={f.text} className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                <span
                  className="material-symbols-outlined text-brand-100"
                  style={{ fontSize: 18 }}
                >
                  {f.icon}
                </span>
              </span>
              {f.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative flex items-center gap-2 text-[11px] text-white/60">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          lock
        </span>
        Secure, encrypted authentication
      </div>
    </div>
  );
}

export function AuthModal({
  isOpen,
  onClose,
  initialMode = "user-login",
  inline = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  inline?: boolean;
}) {
  const router = useRouter();

  const {
    signInWithPassword,
    signInAsAdmin,
    signUp,
    signInWithGoogle,
    verifyEmailOtp,
    resendSignupOtp,

    // Password reset functions.
    sendPasswordResetOtp,
    verifyPasswordResetOtp,
    resendPasswordResetOtp,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Login / registration
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Two-factor (TOTP) challenge shown after a correct password when the user
  // has 2FA enabled in Settings → Security.
  const [twofaPending, setTwofaPending] = useState(false);
  const [twofaCode, setTwofaCode] = useState("");

  // Registration
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState(AFFILIATION_OPTIONS[0]);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Admin. Never pre-fill this: anything in client code is public.
  const [adminSecretKey, setAdminSecretKey] = useState("");

  // Registration OTP
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");

  // Password reset
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Freeze background scrolling while the modal is shown as an overlay popup.
  // The inline /login and /signup routes already scroll inside their own
  // overflow-y-auto panel, so they don't need a body lock.
  const authScrollLockRef = useScrollLock(isOpen && !inline);

  // Inline login/signup: if anything on the page is wider than the screen the
  // browser can be left scrolled sideways (form cut off on the left, empty gap
  // on the right). Pin the horizontal scroll position to 0 and keep it there.
  useEffect(() => {
    if (!inline || !isOpen) return;

    const root = document.documentElement;
    const prevOverflowY = root.style.overflowY;

    // When the whole form fits on screen there is nothing to scroll to, so
    // lock vertical movement too. On very short screens it stays scrollable.
    const fits = () => root.scrollHeight <= window.innerHeight + 1;

    const pinLeft = () => {
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
      root.scrollLeft = 0;
      document.body.scrollLeft = 0;
      if (fits() && window.scrollY !== 0) window.scrollTo(0, 0);
    };

    const applyLock = () => {
      root.style.overflowY = fits() ? "hidden" : prevOverflowY;
      pinLeft();
    };

    // Mouse wheel / trackpad: stop sideways movement (deltaX or Shift+wheel),
    // and stop vertical movement while everything fits.
    const onWheel = (e: WheelEvent) => {
      const sideways = Math.abs(e.deltaX) > 0 || e.shiftKey;
      if (sideways || fits()) e.preventDefault();
    };

    applyLock();
    window.addEventListener("scroll", pinLeft, { passive: true });
    window.addEventListener("resize", applyLock);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.style.overflowY = prevOverflowY;
      window.removeEventListener("scroll", pinLeft);
      window.removeEventListener("resize", applyLock);
      window.removeEventListener("wheel", onWheel);
    };
  }, [inline, isOpen, mode]);

  if (!isOpen) return null;

  const resetMessages = () => {
    setError("");
    setInfo("");
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    resetMessages();
  };

  // ---------------------------------------------------------
  // FARMER LOGIN
  // ---------------------------------------------------------

  const handleUserLogin = async (e: FormEvent) => {
    e.preventDefault();

    resetMessages();
    setBusy(true);

    try {
      const res = await signInWithPassword(email.trim(), password);

      // Password was right but the account is 2FA-protected: swap the form for
      // a code prompt instead of completing the sign-in.
      if (res?.requires2FA) {
        setTwofaPending(true);
        setInfo("Enter the 6-digit code from your authenticator app.");
        return;
      }

      onClose();
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleTwofaSubmit = async (e: FormEvent) => {
    e.preventDefault();

    resetMessages();

    const code = twofaCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    try {
      const res = await signInWithPassword(email.trim(), password, code);
      if (res?.requires2FA) {
        setError("Enter your authentication code to continue.");
        return;
      }
      setTwofaPending(false);
      setTwofaCode("");
      onClose();
      router.push("/dashboard");
    } catch (err: unknown) {
      // A bad code keeps the prompt open so the farmer can retry.
      setError(err instanceof Error ? err.message : "Verification failed");
      setTwofaCode("");
    } finally {
      setBusy(false);
    }
  };

  const cancelTwofa = () => {
    setTwofaPending(false);
    setTwofaCode("");
    resetMessages();
  };

  // ---------------------------------------------------------
  // ADMIN LOGIN
  // ---------------------------------------------------------

  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault();

    resetMessages();
    setBusy(true);

    try {
      await signInAsAdmin(email.trim(), password, adminSecretKey.trim());

      onClose();
      router.push("/admin");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Admin sign in failed");
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------
  // REGISTRATION
  // ---------------------------------------------------------

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();

    resetMessages();

    if (!acceptedTerms) {
      setError("Please accept the Terms and Privacy Policy to continue.");
      return;
    }

    setBusy(true);

    try {
      const res = await signUp({
        email: email.trim(),
        password,
        fullName: name.trim(),
        affiliation,
      });

      if (res.needsVerification) {
        setOtpEmail(email.trim());
        setOtpCode("");

        setMode("verify-otp");

        setInfo(
          `Verification code sent to ${email.trim()}. Please enter the 6-digit code.`
        );
      } else {
        onClose();
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------
  // REGISTRATION OTP
  // ---------------------------------------------------------

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();

    resetMessages();
    setBusy(true);

    try {
      await verifyEmailOtp(otpEmail || email.trim(), otpCode.trim());

      onClose();
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setBusy(false);
    }
  };

  const handleResendSignupOtp = async () => {
    resetMessages();
    setBusy(true);

    try {
      await resendSignupOtp(otpEmail || email.trim());

      setInfo("A new verification code has been sent to your email.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------
  // FORGOT PASSWORD - SEND OTP
  // ---------------------------------------------------------

  const handleSendResetOtp = async (e: FormEvent) => {
    e.preventDefault();

    resetMessages();

    if (!resetEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setBusy(true);

    try {
      await sendPasswordResetOtp(resetEmail.trim());

      setOtpEmail(resetEmail.trim());
      setResetOtp("");

      setMode("verify-reset-otp");

      setInfo(`A verification code has been sent to ${resetEmail.trim()}.`);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send password reset code"
      );
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------
  // PASSWORD RESET OTP VERIFICATION
  // ---------------------------------------------------------

  const handleVerifyResetOtp = async (e: FormEvent) => {
    e.preventDefault();

    resetMessages();

    if (resetOtp.trim().length !== 6) {
      setError("Please enter the 6-digit OTP.");
      return;
    }

    setBusy(true);

    try {
      const { resetToken: token } = await verifyPasswordResetOtp(
        resetEmail.trim(),
        resetOtp.trim()
      );

      setResetToken(token);
      setMode("reset-password");

      setInfo("OTP verified successfully. You can now create a new password.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid or expired OTP");
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------
  // RESEND PASSWORD RESET OTP
  // ---------------------------------------------------------

  const handleResendResetOtp = async () => {
    resetMessages();

    setBusy(true);

    try {
      await resendPasswordResetOtp(resetEmail.trim());

      setResetOtp("");

      setInfo("A new password reset code has been sent.");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to resend password reset code"
      );
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------
  // RESET PASSWORD
  // ---------------------------------------------------------

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();

    resetMessages();

    if (newPassword.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!resetToken) {
      setError("Your reset session has expired. Please verify the OTP again.");
      setMode("verify-reset-otp");
      return;
    }

    setBusy(true);

    try {
      await resetPassword(resetToken, newPassword);

      setNewPassword("");
      setConfirmPassword("");
      setResetOtp("");
      setResetToken("");

      setInfo("Your password has been reset successfully. You can now sign in.");

      setMode("user-login");
      setEmail(resetEmail.trim());
      setPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------
  // GOOGLE LOGIN
  // ---------------------------------------------------------

  const handleGoogleLogin = async () => {
    resetMessages();
    setBusy(true);

    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign in failed");

      setBusy(false);
    }
  };

  // ---------------------------------------------------------
  // TITLE
  // ---------------------------------------------------------

  const getTitle = () => {
    switch (mode) {
      case "user-login":
        return "Farmer & Agronomist Sign In";
      case "admin-login":
        return "Enterprise Admin Sign In";
      case "register":
        return "Create Multi-user Account";
      case "verify-otp":
        return "Verify Email Code";
      case "forgot-password":
        return "Forgot Password?";
      case "verify-reset-otp":
        return "Verify Reset Code";
      case "reset-password":
        return "Create New Password";
      default:
        return "WheatGuard AI";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "user-login":
        return "Access your foliar disease scans, field telemetry & AI diagnostics.";
      case "admin-login":
        return "Enter with administrator credentials and security authorization key.";
      case "register":
        return "Register your field or research profile in the shared neural registry.";
      case "verify-otp":
        return "Enter the 6-digit confirmation code sent to your email.";
      case "forgot-password":
        return "Enter your email to receive a password reset code.";
      case "verify-reset-otp":
        return "Enter the 6-digit code sent to your email.";
      case "reset-password":
        return "Create a strong new password for your account.";
      default:
        return "";
    }
  };

  const showMainTabs =
    mode === "user-login" ||
    mode === "admin-login" ||
    mode === "register" ||
    mode === "verify-otp";

  const content = (
    <div
      className={cn(
        "flex w-full",
        inline
          ? "min-w-0 max-w-full overflow-x-clip bg-transparent"
          : "h-full overflow-hidden border border-line bg-surface shadow-2xl sm:h-auto sm:max-h-[95dvh] sm:max-w-md sm:rounded-2xl lg:max-w-[880px]"
      )}
    >
      {!inline && <AuthBrandPanel />}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !inline && "h-full min-h-0 overflow-hidden sm:max-h-[95dvh]"
        )}
      >
        {/* ================================================= */}
        {/* HEADER — sticky tabs + heading (inline) vs modal banner */}
        {/* ================================================= */}

        {inline ? (
          <>
            {/*
              The tab row is a direct child of the column (not nested inside
              the heading block) so `sticky` can stay pinned while the page
              scrolls. The nearest scrolling ancestor must NOT be
              overflow-hidden / overflow-x-hidden.
            */}
            {showMainTabs && (
              <>
                {/* Home link scrolls away normally */}
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 18 }}
                    >
                      arrow_back
                    </span>
                    Home
                  </button>
                </div>

                {/* Only the three tabs are pinned. No solid background, so the
                    page gradient shows through instead of a white box. */}
                <div className="mb-3">
                  <div className="flex w-full items-center gap-1 rounded-full bg-surface-muted/90 p-1 shadow-sm sm:w-fit">
                    {INLINE_TABS.map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => switchMode(m)}
                        className={cn(
                          "min-w-0 flex-1 truncate rounded-full px-2 py-1.5 text-center text-[12px] font-semibold whitespace-nowrap transition-colors sm:flex-none sm:px-3.5 sm:text-[13px]",
                          mode === m
                            ? "bg-surface text-ink shadow-sm"
                            : "text-muted hover:text-ink"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="mb-4">
              <h2 className="font-serif text-[26px] font-bold leading-tight tracking-tight text-ink">
                {mode === "user-login"
                  ? "Welcome back"
                  : mode === "register"
                  ? "Create your account"
                  : getTitle()}
              </h2>
              <p className="mt-1.5 text-[14px] text-muted">
                {mode === "user-login"
                  ? "Sign in to see your fields and recent scans."
                  : mode === "register"
                  ? "Start detecting wheat disease in seconds."
                  : getSubtitle()}
              </p>
            </div>
          </>
        ) : (
          <div className="relative shrink-0 bg-gradient-to-r from-brand-900 to-brand-700 p-6 pb-5 text-white">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20 }}
              >
                close
              </span>
            </button>

            <div className="mb-2 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                <span
                  className="material-symbols-outlined text-brand-300"
                  style={{ fontSize: 20 }}
                >
                  {mode === "admin-login"
                    ? "admin_panel_settings"
                    : mode === "forgot-password" ||
                      mode === "verify-reset-otp" ||
                      mode === "reset-password"
                    ? "lock_reset"
                    : "eco"}
                </span>
              </div>
              <span className="text-[16px] font-bold tracking-tight">
                WheatGuard AI
              </span>
            </div>

            <h2 className="pr-8 text-[20px] font-extrabold leading-snug">
              {getTitle()}
            </h2>
            <p className="mt-1 pr-6 text-[12px] text-white/80">
              {getSubtitle()}
            </p>
          </div>
        )}

        {/* ================================================= */}
        {/* MAIN NAVIGATION (modal) — pinned, never scrolls   */}
        {/* ================================================= */}

        {showMainTabs && !inline && (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-surface-muted p-2">
            {/* Farmer */}
            <button
              type="button"
              onClick={() => switchMode("user-login")}
              className={`flex-1 rounded-lg px-2 py-2.5 text-[11px] font-bold transition-all sm:text-[12px] ${
                mode === "user-login"
                  ? "border border-line bg-white text-brand-900 shadow-sm"
                  : "text-muted hover:bg-white hover:text-brand-900"
              }`}
            >
              <span className="flex items-center justify-center gap-1">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  agriculture
                </span>
                Farmer
              </span>
            </button>

            {/* Register */}
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 rounded-lg px-2 py-2.5 text-[11px] font-bold transition-all sm:text-[12px] ${
                mode === "register"
                  ? "border border-line bg-white text-brand-900 shadow-sm"
                  : "text-muted hover:bg-white hover:text-brand-900"
              }`}
            >
              <span className="flex items-center justify-center gap-1">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  person_add
                </span>
                Register
              </span>
            </button>

            {/* Admin */}
            <button
              type="button"
              onClick={() => switchMode("admin-login")}
              className={`flex-1 rounded-lg px-2 py-2.5 text-[11px] font-bold transition-all sm:text-[12px] ${
                mode === "admin-login"
                  ? "bg-brand-900 text-white shadow-sm"
                  : "text-muted hover:bg-white hover:text-brand-900"
              }`}
            >
              <span className="flex items-center justify-center gap-1">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  admin_panel_settings
                </span>
                Admin
              </span>
            </button>
          </div>
        )}

        {/* ================================================= */}
        {/* MESSAGES */}
        {/* ================================================= */}

        {(error || info) && (
          <div className={cn("shrink-0", inline ? "pb-3" : "px-6 pt-4")}>
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-danger-soft bg-danger-soft p-3 text-danger">
                <span
                  className="material-symbols-outlined shrink-0"
                  style={{ fontSize: 18 }}
                >
                  error
                </span>

                <p className="text-[12px] leading-relaxed">{error}</p>
              </div>
            )}

            {info && !error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50 p-3 text-brand-800">
                <span
                  className="material-symbols-outlined shrink-0"
                  style={{ fontSize: 18 }}
                >
                  check_circle
                </span>

                <p className="text-[12px] leading-relaxed">{info}</p>
              </div>
            )}
          </div>
        )}

        {/* ================================================= */}
        {/* SCROLLABLE BODY (modal only scrolls this region)  */}
        {/* ================================================= */}

        <div
          className={cn(
            inline
              ? "pt-1"
              : "min-h-0 flex-1 overflow-y-auto overscroll-contain p-6"
          )}
        >
          {/* ================================================= */}
          {/* FARMER LOGIN */}
          {/* ================================================= */}

          {mode === "user-login" && !twofaPending && (
            <form onSubmit={handleUserLogin} className="space-y-3.5">
              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleLogin}
                className="flex h-10 w-full items-center justify-center gap-3 rounded-xl border border-line bg-white px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                <GoogleIcon className="h-5 w-5" />
                {busy ? "Please wait..." : "Continue with Google"}
              </button>

              <div className="flex items-center gap-3 py-0.5">
                <div className="h-px flex-1 bg-line" />
                <span className="text-[12px] font-medium text-muted">
                  or use email
                </span>
                <div className="h-px flex-1 bg-line" />
              </div>

              <EmailField
                label="Email address"
                value={email}
                onChange={setEmail}
                placeholder="name@farm.com"
              />

              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                show={showPassword}
                setShow={setShowPassword}
              />

              <div className="-mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    switchMode("forgot-password");
                  }}
                  className="text-[12px] font-semibold text-brand-700 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-[14px] font-bold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Spinner />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>

              {inline && (
                <p className="pt-1 text-center text-[13px] text-muted">
                  New to WheatGuard?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className="font-bold text-brand-800 hover:underline"
                  >
                    Create an account
                  </button>
                </p>
              )}
            </form>
          )}

          {/* ================================================= */}
          {/* TWO-FACTOR CHALLENGE (after correct password)     */}
          {/* ================================================= */}

          {mode === "user-login" && twofaPending && (
            <form onSubmit={handleTwofaSubmit} className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                <span
                  className="material-symbols-outlined text-brand-700"
                  style={{ fontSize: 22 }}
                >
                  lock
                </span>
                <div>
                  <p className="text-[13px] font-bold text-brand-900">
                    Two-factor verification
                  </p>
                  <p className="text-[12px] text-brand-800">
                    Enter the 6-digit code from your authenticator app to sign
                    in as {email.trim() || "your account"}.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-center text-[12px] font-semibold text-ink">
                  Authentication Code
                </label>
                <OtpInput
                  value={twofaCode}
                  onChange={setTwofaCode}
                  disabled={busy}
                  ariaLabel="Authenticator code"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-[13px] font-bold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  shield
                </span>
                {busy ? "Verifying..." : "Verify & Sign In"}
              </button>

              <button
                type="button"
                onClick={cancelTwofa}
                className="w-full text-[12px] font-semibold text-muted hover:text-ink"
              >
                Use a different account
              </button>
            </form>
          )}

          {/* ================================================= */}
          {/* ADMIN LOGIN */}
          {/* ================================================= */}

          {mode === "admin-login" && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="flex gap-2 rounded-xl border border-wheat-200 bg-[#fffbeb] p-3">
                <span
                  className="material-symbols-outlined text-[#b45309]"
                  style={{ fontSize: 18 }}
                >
                  security
                </span>

                <p className="text-[11px] leading-relaxed text-[#92400e]">
                  Administrator access requires your email, password, and
                  security authorization key.
                </p>
              </div>

              <Field
                label="Administrator Email"
                icon="mail"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="admin@wheatguard.ai"
              />

              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                show={showPassword}
                setShow={setShowPassword}
              />

              <Field
                label="Security Secret Key"
                icon="key"
                type="password"
                value={adminSecretKey}
                onChange={setAdminSecretKey}
                placeholder="Security key"
              />

              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-900 text-[13px] font-bold text-white hover:bg-brand-800 disabled:opacity-60"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  admin_panel_settings
                </span>
                {busy ? "Authorizing..." : "Authorize Enterprise Admin"}
              </button>
            </form>
          )}

          {/* ================================================= */}
          {/* REGISTER */}
          {/* ================================================= */}

          {mode === "register" && (
            <form onSubmit={handleRegister} className="space-y-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleLogin}
                className="flex h-10 w-full items-center justify-center gap-3 rounded-xl border border-line bg-white px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                <GoogleIcon className="h-5 w-5" />
                {busy ? "Please wait..." : "Continue with Google"}
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-line" />
                <span className="text-[12px] font-medium text-muted">
                  or sign up with email
                </span>
                <div className="h-px flex-1 bg-line" />
              </div>

              {/* Row 1: name + email (stacked on phones, side by side on sm+) */}
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field
                  label="Full name"
                  icon="person"
                  value={name}
                  onChange={setName}
                  placeholder="Your full name"
                />

                <EmailField
                  label="Email address"
                  value={email}
                  onChange={setEmail}
                  placeholder="your@email.com"
                  id="signup-email"
                />
              </div>

              {/* Row 2: password + affiliation */}
              <div className="grid items-start gap-2.5 sm:grid-cols-2">
              <div>
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  setShow={setShowPassword}
                  placeholder="Create password"
                />
                <StrengthMeter password={password} />
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-ink">
                  Professional affiliation
                </label>

                <div className="relative">
                  <span
                    className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    style={{ fontSize: 18 }}
                  >
                    work
                  </span>

                  <select
                    value={affiliation}
                    onChange={(e) => setAffiliation(e.target.value)}
                    className="h-10 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-[13px] text-ink outline-none"
                  >
                    {AFFILIATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              </div>

              <label className="flex items-start gap-2.5 text-[12px] text-muted">
                <input
                  type="checkbox"
                  required
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-brand-700 focus:outline-none"
                />
                <span>
                  I agree to the{" "}
                  <span className="font-semibold text-brand-800">Terms</span>{" "}
                  and{" "}
                  <span className="font-semibold text-brand-800">
                    Privacy Policy
                  </span>
                </span>
              </label>

              <button
                type="submit"
                disabled={busy}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-[14px] font-bold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Spinner />
                    Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </button>

              {inline && (
                <p className="pt-1 text-center text-[13px] text-muted">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("user-login")}
                    className="font-bold text-brand-800 hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </form>
          )}

          {/* ================================================= */}
          {/* REGISTRATION VERIFY OTP */}
          {/* ================================================= */}

          {mode === "verify-otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
                  <span
                    className="material-symbols-outlined text-brand-700"
                    style={{ fontSize: 28 }}
                  >
                    mark_email_read
                  </span>
                </div>

                <h3 className="text-[16px] font-bold text-ink">
                  Check your email
                </h3>

                <p className="mt-1 text-[12px] text-muted">
                  We sent a 6-digit verification code to
                </p>

                <p className="mt-1 break-all text-[12px] font-bold text-brand-700">
                  {otpEmail || email}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-center text-[12px] font-semibold text-ink">
                  Verification Code
                </label>

                <OtpInput
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={busy}
                  ariaLabel="Email verification code"
                />
              </div>

              <button
                type="submit"
                disabled={busy || otpCode.length !== 6}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-[13px] font-bold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  verified
                </span>
                {busy ? "Verifying..." : "Verify Email"}
              </button>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResendSignupOtp}
                  className="text-[12px] font-semibold text-brand-700 hover:underline"
                >
                  Resend OTP
                </button>

                <span className="text-line">|</span>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => switchMode("register")}
                  className="text-[12px] font-semibold text-muted hover:text-brand-700"
                >
                  Change Email
                </button>
              </div>
            </form>
          )}

          {/* ================================================= */}
          {/* FORGOT PASSWORD */}
          {/* ================================================= */}

          {mode === "forgot-password" && (
            <form onSubmit={handleSendResetOtp} className="space-y-5">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
                  <span
                    className="material-symbols-outlined text-brand-700"
                    style={{ fontSize: 28 }}
                  >
                    lock_reset
                  </span>
                </div>

                <h3 className="text-[17px] font-bold text-ink">
                  Forgot your password?
                </h3>

                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Enter your registered email address. We&apos;ll send you a
                  verification code.
                </p>
              </div>

              <Field
                label="Registered Email"
                icon="mail"
                type="email"
                value={resetEmail}
                onChange={setResetEmail}
                placeholder="farmer@wheatguard.ai"
              />

              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-[13px] font-bold text-white hover:bg-brand-800 disabled:opacity-60"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  send
                </span>
                {busy ? "Sending OTP..." : "Send Verification Code"}
              </button>

              <button
                type="button"
                onClick={() => switchMode("user-login")}
                className="h-10 w-full rounded-xl text-[12px] font-semibold text-muted hover:bg-surface-muted hover:text-brand-700"
              >
                ← Back to Sign In
              </button>
            </form>
          )}

          {/* ================================================= */}
          {/* PASSWORD RESET VERIFY OTP */}
          {/* ================================================= */}

          {mode === "verify-reset-otp" && (
            <form onSubmit={handleVerifyResetOtp} className="space-y-5">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
                  <span
                    className="material-symbols-outlined text-brand-700"
                    style={{ fontSize: 28 }}
                  >
                    pin
                  </span>
                </div>

                <h3 className="text-[17px] font-bold text-ink">
                  Enter Verification Code
                </h3>

                <p className="mt-1 text-[12px] text-muted">Code sent to:</p>

                <p className="mt-1 break-all text-[12px] font-bold text-brand-700">
                  {resetEmail}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-center text-[12px] font-semibold text-ink">
                  6-Digit OTP
                </label>

                <OtpInput
                  value={resetOtp}
                  onChange={setResetOtp}
                  disabled={busy}
                  ariaLabel="Password reset code"
                />
              </div>

              <button
                type="submit"
                disabled={busy || resetOtp.length !== 6}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-[13px] font-bold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  verified
                </span>
                {busy ? "Verifying..." : "Verify OTP"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleResendResetOtp}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 text-[12px] font-bold text-brand-700 hover:bg-brand-100"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 17 }}
                >
                  refresh
                </span>
                {busy ? "Sending..." : "Resend OTP"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => switchMode("forgot-password")}
                className="h-10 w-full text-[12px] font-semibold text-muted hover:text-brand-700"
              >
                ← Change Email
              </button>
            </form>
          )}

          {/* ================================================= */}
          {/* RESET PASSWORD */}
          {/* ================================================= */}

          {mode === "reset-password" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="mb-2 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
                  <span
                    className="material-symbols-outlined text-brand-700"
                    style={{ fontSize: 28 }}
                  >
                    lock_reset
                  </span>
                </div>

                <h3 className="text-[17px] font-bold text-ink">
                  Create New Password
                </h3>

                <p className="mt-1 text-[12px] text-muted">
                  Your OTP has been verified.
                </p>
              </div>

              <PasswordField
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                show={showNewPassword}
                setShow={setShowNewPassword}
                placeholder="Enter new password"
              />

              <PasswordField
                label="Confirm New Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirmPassword}
                setShow={setShowConfirmPassword}
                placeholder="Confirm new password"
              />

              <div className="rounded-xl border border-line bg-surface-muted p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-muted"
                    style={{ fontSize: 17 }}
                  >
                    info
                  </span>

                  <span className="text-[11px] font-semibold text-ink">
                    Password requirements
                  </span>
                </div>

                <ul className="list-disc space-y-0.5 pl-6 text-[11px] text-muted">
                  <li>At least 8 characters</li>
                  <li>Both passwords must match</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={busy || !newPassword || !confirmPassword}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-[13px] font-bold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  save
                </span>
                {busy ? "Resetting Password..." : "Reset Password"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => switchMode("verify-reset-otp")}
                className="h-10 w-full text-[12px] font-semibold text-muted hover:text-brand-700"
              >
                ← Back to OTP
              </button>
            </form>
          )}
        </div>

        {/* ================================================= */}
        {/* FOOTER */}
        {/* ================================================= */}

        {inline ? (
          <div className="flex items-center justify-center gap-1.5 pt-5 text-[11px] text-muted">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              verified_user
            </span>
            Secure authentication powered by WheatGuard AI
          </div>
        ) : (
          <div className="shrink-0 border-t border-line bg-surface-muted px-6 py-3">
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14 }}
              >
                verified_user
              </span>
              Secure authentication powered by WheatGuard AI
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // =========================================================
  // MODAL WRAPPER
  // =========================================================

  if (inline) {
    return (
      <>
        {/* Inline login/signup pages: no horizontal scroll, no visible
            scrollbars (the page can still scroll with touch/wheel). */}
        <style>{`
          html, body {
            overflow-x: hidden !important;
            overflow-x: clip !important;
            max-width: 100%;
            overscroll-behavior-x: none;
            touch-action: pan-y pinch-zoom;
          }
          html, body, * { scrollbar-width: none; -ms-overflow-style: none; }
          html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar {
            display: none; width: 0; height: 0;
          }
        `}</style>
        {content}
      </>
    );
  }

  return (
    <div
      ref={authScrollLockRef}
      className="fixed inset-0 z-[100] flex items-stretch justify-center overflow-hidden bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
    >
      {content}
    </div>
  );
}