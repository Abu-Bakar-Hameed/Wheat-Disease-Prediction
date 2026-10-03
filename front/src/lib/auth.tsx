"use client";

/**
 * Authentication context for WheatGuard AI.
 *
 * This is the ONLY auth module in the app (there used to be a
 * conflicting `lib/auth.ts` + `lib/auth.tsx` pair — that duplicate
 * has been removed). Every request here maps 1:1 onto the routes
 * exposed by the Express backend in `routes/auth.routes.js`:
 *
 *   POST /register            -> signUp
 *   POST /verify-otp          -> verifyEmailOtp
 *   POST /resend-otp          -> resendSignupOtp
 *   POST /login               -> signInWithPassword
 *   POST /admin/login         -> signInAsAdmin        (X-Admin-Secret-Key header)
 *   POST /forgot-password     -> sendPasswordResetOtp
 *   POST /verify-reset-otp    -> verifyPasswordResetOtp (returns a resetToken)
 *   POST /resend-reset-otp    -> resendPasswordResetOtp
 *   POST /reset-password      -> resetPassword         ({ resetToken, newPassword, confirmPassword })
 *   GET  /me                  -> used on load to validate/refresh the session
 *   GET  /google, /microsoft  -> signInWithGoogle / signInWithMicrosoft (redirect flows)
 *
 * ADMIN AUTHENTICATION
 * The backend hardcodes exactly one admin account:
 *   email:      sw@gmail.com
 *   password:   sw@gmail.com
 *   secret key: value of ADMIN_SECRET_KEY on the server
 * The frontend must send the same secret key as
 * NEXT_PUBLIC_ADMIN_SECRET_KEY (see admin login below) — if the two
 * env vars ever drift, admin login fails with "Invalid admin secret
 * key" even with correct credentials.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { markFeedbackPromptPending } from "@/lib/feedbackPrompt";

// ============================================================
// Config
// ============================================================

const AUTH_API_URL = (process.env.NEXT_PUBLIC_AUTH_API_URL ?? "")
  .trim()
  .replace(/\/$/, "");

// Must match the server's ADMIN_SECRET_KEY (see src/middleware/auth.middleware.js
// on the backend). Only used for the static admin account below.
const ADMIN_SECRET_KEY = (
  process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY ?? "4340304313639"
).trim();

// The one and only admin account the backend accepts.
export const STATIC_ADMIN_EMAIL = "sw@gmail.com";
export const STATIC_ADMIN_PASSWORD = "sw@gmail.com";

const BACKEND_SESSION_KEY = "wg_backend_session";
const BACKEND_USER_KEY = "wg_backend_user";

// ============================================================
// Types
// ============================================================

export type AuthUser = User;

interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  affiliation: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  displayName: string;
  initials: string;
  affiliation: string;
  email: string;
  configured: boolean;

  // Core auth
  signInWithPassword: (
    email: string,
    password: string,
    totpCode?: string
  ) => Promise<{ requires2FA?: boolean }>;
  signInAsAdmin: (
    email: string,
    password: string,
    secretKey?: string
  ) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<{ needsVerification: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;

  // Registration OTP
  verifyEmailOtp: (email: string, otp: string) => Promise<void>;
  resendSignupOtp: (email: string) => Promise<void>;

  // Password reset OTP flow
  sendPasswordResetOtp: (email: string) => Promise<void>;
  verifyPasswordResetOtp: (
    email: string,
    otp: string
  ) => Promise<{ resetToken: string }>;
  resendPasswordResetOtp: (email: string) => Promise<void>;
  resetPassword: (resetToken: string, newPassword: string) => Promise<void>;

  // Misc
  updateProfile: (params: { fullName?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

// ============================================================
// Helpers
// ============================================================

type BackendUserPayload = {
  id?: string;
  email?: string;
  name?: string;
  organizationName?: string;
  role?: string;
  emailVerified?: boolean;
};

type BackendTokens = {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: string | number;
};

function normalizeUser(raw: BackendUserPayload | null | undefined): AuthUser {
  const email = raw?.email ?? "";
  const name = raw?.name || (email ? email.split("@")[0] : "User");
  const organizationName = raw?.organizationName ?? "";
  const role = raw?.role ?? "user";

  return {
    id: raw?.id ?? "unknown",
    email,
    aud: "authenticated",
    role,
    app_metadata: { role },
    user_metadata: {
      full_name: name,
      name,
      organization_name: organizationName,
      affiliation: organizationName,
      role,
    },
    identities: [],
    created_at: new Date().toISOString(),
  } as unknown as AuthUser;
}

function parseExpiresInSeconds(raw: unknown, fallback = 7 * 24 * 60 * 60): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const str = String(raw ?? "").trim();
  const match = str.match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return fallback;
  const value = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const multiplier =
    unit === "d" ? 86400 : unit === "h" ? 3600 : unit === "m" ? 60 : 1;
  return value * multiplier;
}

function buildSession(
  user: AuthUser,
  tokens: BackendTokens | undefined
): Session {
  const expiresIn = parseExpiresInSeconds(tokens?.expiresIn);

  return {
    access_token: tokens?.accessToken ?? "",
    refresh_token: tokens?.refreshToken ?? "",
    token_type: tokens?.tokenType ?? "Bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user,
  } as Session;
}

function persistSession(data: {
  user?: BackendUserPayload;
  tokens?: BackendTokens;
  showFeedback?: boolean;
}): { user: AuthUser; session: Session } {
  const user = normalizeUser(data.user);
  const session = buildSession(user, data.tokens);

  if (typeof window !== "undefined") {
    localStorage.setItem(
      BACKEND_SESSION_KEY,
      JSON.stringify({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        tokenType: session.token_type,
        expiresIn: session.expires_in,
      })
    );
    localStorage.setItem(BACKEND_USER_KEY, JSON.stringify(data.user ?? null));
    // Mirror the admin role into a readable cookie so Next.js middleware can
    // gate the /admin route group server-side (see src/middleware.ts). This is
    // a coarse UI-level gate; the real authority check is the backend's
    // role/JWT validation on every /admin API call.
    document.cookie = userIsAdmin(user)
      ? "wg_admin=1; path=/; max-age=86400; SameSite=Lax"
      : "wg_admin=; path=/; max-age=0; SameSite=Lax";
    // Popup-only feedback: every successful login arms the automatic prompt
    // (shown 3 minutes later on the dashboard). The browser only hands the
    // one-shot "a login just happened" signal to FeedbackPromptGate; eligibility
    // is purely time-based now, not the old server login-count gate. See
    // lib/feedbackPrompt.ts.
    markFeedbackPromptPending();
  }

  return { user, session };
}

function readStoredSession(): { user: AuthUser | null; session: Session | null } {
  if (typeof window === "undefined") return { user: null, session: null };

  try {
    const rawSession = localStorage.getItem(BACKEND_SESSION_KEY);
    const rawUser = localStorage.getItem(BACKEND_USER_KEY);
    if (!rawSession || !rawUser) return { user: null, session: null };

    const savedSession = JSON.parse(rawSession) as {
      accessToken?: string;
      refreshToken?: string;
      tokenType?: string;
      expiresIn?: number;
    };
    const savedUser = JSON.parse(rawUser) as BackendUserPayload;

    if (!savedSession.accessToken) return { user: null, session: null };

    const user = normalizeUser(savedUser);
    const session = buildSession(user, savedSession);

    return { user, session };
  } catch {
    return { user: null, session: null };
  }
}

function clearStoredSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(BACKEND_SESSION_KEY);
  localStorage.removeItem(BACKEND_USER_KEY);
  // Drop the admin gate cookie on sign-out so middleware stops recognising
  // the session as an admin one.
  document.cookie = "wg_admin=; path=/; max-age=0; SameSite=Lax";
}

export function userDisplayName(user: AuthUser | null): string {
  if (!user) return "Guest";
  const meta = user.user_metadata ?? {};
  return (
    (meta.full_name as string) ||
    (meta.name as string) ||
    user.email?.split("@")[0] ||
    "User"
  );
}

export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function userIsAdmin(user: AuthUser | null): boolean {
  if (!user) return false;
  const role = String(
    user.role ?? user.user_metadata?.role ?? user.app_metadata?.role ?? ""
  ).toLowerCase();
  return role === "admin";
}

/**
 * Turns raw backend error messages into user-facing copy.
 * The backend already sends clear `message` fields, so this only
 * covers a handful of cases worth rephrasing.
 */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("admin login")) {
    return "This account uses admin login. Please use the Admin Login page.";
  }
  if (m.includes("admin secret key")) {
    return "Invalid admin secret key. Check the security key and try again.";
  }
  if (m.includes("invalid email or password")) {
    return "Incorrect email or password.";
  }
  if (m.includes("verify your email")) {
    return message; // already clear, keep as-is
  }
  if (m.includes("otp") && m.includes("expired")) {
    return "That code has expired. Please request a new one.";
  }
  if (m.includes("invalid otp")) {
    return "That code is incorrect. Please double-check and try again.";
  }
  if (m.includes("reset session") || m.includes("reset token")) {
    return "This reset session has expired. Please start the password reset again.";
  }
  if (m.includes("too many") || m.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return message;
}

// Thrown by authFetch specifically when the server confirms the request
// was unauthenticated/unauthorized (401/403). Anything else - a network
// blip, CORS failure, cold start, 5xx - throws a plain Error instead, so
// callers can tell "your token is bad" apart from "we couldn't check".
class AuthUnauthorizedError extends Error {
  payload: Record<string, unknown>;
  constructor(message: string, payload?: Record<string, unknown>) {
    super(message);
    this.payload = payload ?? {};
  }
}

async function authFetch(path: string, options: RequestInit = {}) {
  if (!AUTH_API_URL) {
    throw new Error(
      "Authentication service is not configured. Set NEXT_PUBLIC_AUTH_API_URL."
    );
  }

  let response: Response;
  try {
    response = await fetch(`${AUTH_API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      `Cannot reach the authentication server at ${AUTH_API_URL}. Is it running?`
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    throw new AuthUnauthorizedError(
      friendlyAuthError(payload?.message ?? "Authentication request failed"),
      payload
    );
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(
      friendlyAuthError(payload?.message ?? "Authentication request failed")
    );
  }

  return payload;
}

// ============================================================
// Provider
// ============================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = Boolean(AUTH_API_URL);

  // Guards against setting state after unmount during the initial
  // session check.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applySession = useCallback(
    (data: {
      user?: BackendUserPayload;
      tokens?: BackendTokens;
      showFeedback?: boolean;
    }) => {
      const { user: nextUser, session: nextSession } = persistSession(data);
      setUser(nextUser);
      setSession(nextSession);
      return { user: nextUser, session: nextSession };
    },
    []
  );

  /**
   * Re-validates the current token against GET /me. Called on mount
   * and can be called manually (`refreshUser`) after profile changes.
   * Clears the session if the token is missing/expired/invalid.
   */
  const refreshUser = useCallback(async () => {
    const stored = readStoredSession();

    if (!stored.session?.access_token) {
      if (mountedRef.current) {
        setUser(null);
        setSession(null);
      }
      return;
    }

    try {
      const data = await authFetch("/me", {
        headers: { Authorization: `Bearer ${stored.session.access_token}` },
      });

      const refreshedUser = normalizeUser(data.user);
      if (typeof window !== "undefined") {
        localStorage.setItem(BACKEND_USER_KEY, JSON.stringify(data.user));
      }

      if (mountedRef.current) {
        setUser(refreshedUser);
        setSession({ ...stored.session, user: refreshedUser });
      }
    } catch (err) {
      if (err instanceof AuthUnauthorizedError) {
        // The server confirmed this token is actually bad - safe to drop.
        clearStoredSession();
        if (mountedRef.current) {
          setUser(null);
          setSession(null);
        }
      }
      // Otherwise (network error, CORS, cold start, 5xx): we couldn't
      // confirm anything either way. Keep the cached session/token as-is
      // so other components (e.g. the admin users list, which reads the
      // token straight from localStorage) can still use it instead of
      // racing this check and losing a perfectly valid token.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const stored = readStoredSession();

      if (stored.user && stored.session) {
        // Show the cached session immediately, then verify in the background.
        setUser(stored.user);
        setSession(stored.session);
      }

      if (stored.session?.access_token) {
        await refreshUser();
      }

      if (!cancelled) setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------

  const signInWithPassword = useCallback(
    async (
      email: string,
      password: string,
      totpCode?: string
    ): Promise<{ requires2FA?: boolean }> => {
      try {
        const data = await authFetch("/login", {
          method: "POST",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            ...(totpCode ? { totp_code: totpCode } : {}),
          }),
        });

        // Correct password but 2FA still pending: no token issued yet.
        if (data?.requires2FA) {
          return { requires2FA: true };
        }

        applySession(data);
        return {};
      } catch (err) {
        // A wrong/expired second factor comes back as 401 { bad2FACode }.
        // Surface a distinct, retryable message so the prompt stays open.
        if (
          err instanceof AuthUnauthorizedError &&
          err.payload?.bad2FACode
        ) {
          throw new Error(
            "That authentication code isn't valid. Check your app and try again."
          );
        }
        throw err;
      }
    },
    [applySession]
  );

  // ----------------------------------------------------------
  // ADMIN LOGIN (static Gmail + password + secret key)
  // ----------------------------------------------------------

  const signInAsAdmin = useCallback(
    async (email: string, password: string, secretKey?: string) => {
      const resolvedSecret = (secretKey ?? ADMIN_SECRET_KEY).trim();

      const data = await authFetch("/admin/login", {
        method: "POST",
        headers: { "X-Admin-Secret-Key": resolvedSecret },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          // Trim to match the email/secret handling above. The static admin
          // password has no surrounding whitespace, so a stray leading/trailing
          // space from copy-paste or browser autofill would otherwise cause a
          // confusing "Invalid email or password" 401.
          password: password.trim(),
        }),
      });
      applySession(data);
    },
    [applySession]
  );

  // ----------------------------------------------------------
  // REGISTER
  // ----------------------------------------------------------

  const signUp = useCallback(async (params: SignUpParams) => {
    const data = await authFetch("/register", {
      method: "POST",
      body: JSON.stringify({
        name: params.fullName.trim(),
        organizationName: params.affiliation.trim(),
        email: params.email.trim().toLowerCase(),
        password: params.password,
        confirmPassword: params.password,
      }),
    });
    return { needsVerification: Boolean(data.requiresVerification) };
  }, []);

  // ----------------------------------------------------------
  // GOOGLE / MICROSOFT (redirect flows handled server-side)
  // ----------------------------------------------------------

  const signInWithGoogle = useCallback(async () => {
    if (!AUTH_API_URL) {
      throw new Error(
        "Authentication service is not configured. Set NEXT_PUBLIC_AUTH_API_URL."
      );
    }
    window.location.assign(`${AUTH_API_URL}/google`);
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    if (!AUTH_API_URL) {
      throw new Error(
        "Authentication service is not configured. Set NEXT_PUBLIC_AUTH_API_URL."
      );
    }
    window.location.assign(`${AUTH_API_URL}/microsoft`);
  }, []);

  // ----------------------------------------------------------
  // REGISTRATION OTP
  // ----------------------------------------------------------

  const verifyEmailOtp = useCallback(
    async (email: string, otp: string) => {
      const data = await authFetch("/verify-otp", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });
      applySession(data);
    },
    [applySession]
  );

  const resendSignupOtp = useCallback(async (email: string) => {
    await authFetch("/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  }, []);

  // ----------------------------------------------------------
  // PASSWORD RESET OTP FLOW
  // ----------------------------------------------------------

  const sendPasswordResetOtp = useCallback(async (email: string) => {
    await authFetch("/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  }, []);

  const verifyPasswordResetOtp = useCallback(
    async (email: string, otp: string) => {
      const data = await authFetch("/verify-reset-otp", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });
      if (!data.resetToken) {
        throw new Error("Reset token was not returned by the server.");
      }
      return { resetToken: data.resetToken as string };
    },
    []
  );

  const resendPasswordResetOtp = useCallback(async (email: string) => {
    await authFetch("/resend-reset-otp", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  }, []);

  const resetPassword = useCallback(
    async (resetToken: string, newPassword: string) => {
      await authFetch("/reset-password", {
        method: "POST",
        body: JSON.stringify({
          resetToken,
          newPassword,
          confirmPassword: newPassword,
        }),
      });
    },
    []
  );

  // ----------------------------------------------------------
  // PROFILE (local only — the backend does not expose an update
  // endpoint yet; this just keeps the cached display name in sync)
  // ----------------------------------------------------------

  const updateProfile = useCallback(async (params: { fullName?: string }) => {
    if (!params.fullName) return;

    const stored = readStoredSession();
    if (!stored.user) return;

    const updatedUser: AuthUser = {
      ...stored.user,
      user_metadata: {
        ...stored.user.user_metadata,
        full_name: params.fullName,
        name: params.fullName,
      },
    } as AuthUser;

    if (typeof window !== "undefined") {
      const rawUser = localStorage.getItem(BACKEND_USER_KEY);
      const backendUser = rawUser ? JSON.parse(rawUser) : {};
      localStorage.setItem(
        BACKEND_USER_KEY,
        JSON.stringify({ ...backendUser, name: params.fullName })
      );
    }

    setUser(updatedUser);
  }, []);

  // ----------------------------------------------------------
  // SIGN OUT
  // ----------------------------------------------------------

  const signOut = useCallback(async () => {
    // Record the explicit sign-out server-side (user_logout activity event
    // for retention analytics) BEFORE clearing local storage — once the
    // token is gone we can't authenticate the request. Best-effort: a
    // network failure must never block signing out locally.
    try {
      const stored = readStoredSession();
      const accessToken = stored.session?.access_token;
      if (accessToken) {
        await authFetch("/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    } catch {
      // Ignore — the local session is cleared regardless.
    }

    clearStoredSession();
    if (typeof window !== "undefined") {
      localStorage.removeItem("wg_role");
    }
    setUser(null);
    setSession(null);
  }, []);

  // ----------------------------------------------------------
  // Derived display values
  // ----------------------------------------------------------

  const displayName = userDisplayName(user);
  const initials = userInitials(displayName);
  const isAdmin = userIsAdmin(user);
  const affiliation = String(
    user?.user_metadata?.affiliation ?? user?.user_metadata?.organization_name ?? ""
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      isAdmin,
      displayName,
      initials,
      affiliation,
      email: user?.email ?? "",
      configured,

      signInWithPassword,
      signInAsAdmin,
      signUp,
      signInWithGoogle,
      signInWithMicrosoft,

      verifyEmailOtp,
      resendSignupOtp,

      sendPasswordResetOtp,
      verifyPasswordResetOtp,
      resendPasswordResetOtp,
      resetPassword,

      updateProfile,
      signOut,
      refreshUser,
    }),
    [
      user,
      session,
      loading,
      isAdmin,
      displayName,
      initials,
      affiliation,
      configured,
      signInWithPassword,
      signInAsAdmin,
      signUp,
      signInWithGoogle,
      signInWithMicrosoft,
      verifyEmailOtp,
      resendSignupOtp,
      sendPasswordResetOtp,
      verifyPasswordResetOtp,
      resendPasswordResetOtp,
      resetPassword,
      updateProfile,
      signOut,
      refreshUser,
    ]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}