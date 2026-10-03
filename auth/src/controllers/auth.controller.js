import { supabase, supabaseAdmin } from "../config/supabase.js";
import { sendOtpEmail, sendPasswordResetEmail, sendLoginEmail } from "../services/email.service.js";
import { generateOtp, hashOtp } from "../utils/otp.js";
import { verifyTotp } from "../utils/totp.js";
import { signAccessToken, signRefreshToken } from "../utils/jwt.js";
import redis from "../config/redis.js";
import crypto from "crypto";
import { createNotification } from "../services/notification.service.js";
import { recordActivity } from "../services/activity.service.js";
import { registerLoginAndCheckPrompt } from "../services/feedback.service.js";

// ── Fire-and-forget notification helper ──────────────────────────────────────
// Never blocks the HTTP response. Swallows all errors silently.
const notify = (opts) => {
  createNotification(opts).catch((err) =>
    console.error("❌ Notification create failed:", err.message)
  );
};

// ── Fire-and-forget activity-tracking helper ────────────────────────────────
// Records a meaningful user event (register / login / logout) for the admin
// retention analytics module. Never blocks the HTTP response; recordActivity
// already swallows errors and resolves to true/false.
const trackActivity = (userId, eventType, metadata = {}) => {
  void recordActivity({ userId, eventType, metadata });
};

// Turn a raw User-Agent string into a short human label for the Security →
// "recent sign-in activity" list (e.g. "Chrome on Windows"). Best-effort and
// never throws; unknown agents fall back to a generic bucket.
function describeUserAgent(ua) {
  const s = String(ua || "");
  if (!s) return "Unknown device";
  const browser =
    /Edg\//.test(s) ? "Edge" :
    /OPR\/|Opera/.test(s) ? "Opera" :
    /Firefox\//.test(s) ? "Firefox" :
    /Chrome\//.test(s) ? "Chrome" :
    /Safari\//.test(s) ? "Safari" : "Browser";
  const os =
    /Windows/.test(s) ? "Windows" :
    /Android/.test(s) ? "Android" :
    /iPhone|iPad|iOS/.test(s) ? "iOS" :
    /Mac OS X|Macintosh/.test(s) ? "macOS" :
    /Linux/.test(s) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

// Best-effort client IP, honouring the usual proxy headers (the app runs
// behind a reverse proxy in production).
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "";
}

// OTPs are valid for 10 minutes. Emails are sent in the background
// (see the *Async helpers below), so this needs real headroom -
// it must not be shorter than realistic email delivery time.
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_S  = 10 * 60;

// Profile cache TTL: 5 minutes. Short enough to stay fresh,
// long enough to eliminate repeated DB roundtrips on /me.
const PROFILE_TTL_S = 5 * 60;

// --------------------------------------------------------
// Cache key helpers — centralised so they never drift.
// --------------------------------------------------------

const profileKey = (userId) => `profile:${userId}`;
const otpKey     = (email)  => `otp:${email}`;
const passwordResetOtpKey = (email) => `password-reset-otp:${email}`;
const passwordResetTokenKey = (token) => `password-reset-token:${token}`;
const isValidUuid = (value) => {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
};

// Overridable via ADMIN_EMAIL / ADMIN_PASSWORD env vars. The bare fallback
// values below are a weak, publicly-known default (password === email) -
// they exist only so the admin panel still works on a fresh clone before
// the operator sets real credentials. Set ADMIN_EMAIL and ADMIN_PASSWORD
// (a strong, unique password) in .env before deploying anywhere real.
const STATIC_ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "sw@gmail.com";

const STATIC_ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "sw@gmail.com";
// --------------------------------------------------------
// Fire-and-forget email helpers.
//
// The HTTP response should not wait on Gmail. We've already
// committed the OTP / reset link to the database by the time
// these are called, so the user can always hit "resend" if an
// email genuinely fails to arrive. We just log failures instead
// of making the request hang until Gmail finishes.
// --------------------------------------------------------

const sendOtpEmailAsync = (email, otp, name) => {
  sendOtpEmail(email, otp, name).catch((error) => {
    console.error(
      `❌ Background OTP email failed for ${email}:`,
      error.message
    );
  });
};

const sendPasswordResetEmailAsync = (email, resetLink) => {
  sendPasswordResetEmail(email, resetLink).catch((error) => {
    console.error(
      `❌ Background password reset email failed for ${email}:`,
      error.message
    );
  });
};

const sendLoginEmailAsync = (email, name) => {
  sendLoginEmail(email, name).catch((error) => {
    console.error(
      `❌ Background login email failed for ${email}:`,
      error.message
    );
  });
};

export const register = async (req, res) => {
  try {
    const {
      name,
      organizationName,
      email,
      password,
      confirmPassword
    } = req.body;

    // --------------------------------
    // 1. Validate required fields
    // --------------------------------

    if (
      !name ||
      !organizationName ||
      !email ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const cleanName = name.trim();
    const cleanOrganizationName =
      organizationName.trim();

    const cleanEmail =
      email.trim().toLowerCase();

    // --------------------------------
    // 2. Validate password
    // --------------------------------

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters"
      });
    }

    // --------------------------------
    // 3. Validate email
    // --------------------------------

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address"
      });
    }

    // --------------------------------
    // 4. Create Supabase Auth user
    // --------------------------------

    const {
      data: authData,
      error: authError
    } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: false,
      user_metadata: {
        name: cleanName,
        organization_name: cleanOrganizationName
      }
    });

    if (authError) {
      console.error("Supabase Auth error:", authError);

      return res.status(400).json({
        success: false,
        message: authError.message
      });
    }

    const user = authData.user;

    // --------------------------------
    // 5. Create profile
    // --------------------------------

    const {
      error: profileError
    } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: user.id,
        name: cleanName,
        organization_name: cleanOrganizationName,
        email: cleanEmail,
        role: "user",
        email_verified: false
      });

    if (profileError) {
      console.error("Profile error:", profileError);

      await supabaseAdmin.auth.admin.deleteUser(
        user.id
      );

      return res.status(500).json({
        success: false,
        message: "Could not create user profile"
      });
    }

    // --------------------------------
    // 6. Generate OTP
    // --------------------------------

    const otp = generateOtp();

    const otpHash = hashOtp(otp);

    const expiresAt = new Date(
      Date.now() + OTP_TTL_MS
    );

    // --------------------------------
    // 7. Store OTP hash in DB
    // --------------------------------

    const { error: otpError } =
      await supabaseAdmin
        .from("email_otps")
        .insert({
          user_id: user.id,
          email: cleanEmail,
          otp_hash: otpHash,
          expires_at: expiresAt.toISOString()
        });

    if (otpError) {
      console.error("OTP database error:", otpError);

      await supabaseAdmin.auth.admin.deleteUser(
        user.id
      );

      return res.status(500).json({
        success: false,
        message: "Could not create verification code"
      });
    }

    // --------------------------------
    // 8. Cache OTP record in Redis
    //    so verifyOtp can skip the DB lookup
    // --------------------------------

    const otpCachePayload = JSON.stringify({
      id:       null,           // not needed for hash comparison
      user_id:  user.id,
      email:    cleanEmail,
      otp_hash: otpHash,
      expires_at: expiresAt.toISOString(),
      verified: false
    });

    await redis.set(otpKey(cleanEmail), otpCachePayload, { EX: OTP_TTL_S });

    // --------------------------------
    // 9. Send OTP through Gmail (background)
    // --------------------------------

    sendOtpEmailAsync(cleanEmail, otp, cleanName);

    // --------------------------------
    // 10. Response
    // --------------------------------

    // Signup notification (fire-and-forget)
    notify({
      userId:    user.id,
      title:     "Welcome to WheatGuard AI!",
      message:   "Your account has been created. Please verify your email to get started.",
      type:      "signup",
      category:  "account",
      priority:  "normal",
      actionUrl: "/dashboard",
      userEmail: cleanEmail,
      userName:  cleanName,
      sendEmail: false,  // OTP email already covers this
    });

    // Registration activity event (fire-and-forget, retention analytics)
    trackActivity(user.id, "user_registered", { source: "email" });

    return res.status(201).json({
      success: true,
      message:
        "Account created. A 6-digit verification code has been sent to your email.",
      user: {
        id: user.id,
        email: user.email,
        name: cleanName,
        organizationName: cleanOrganizationName
      },
      requiresVerification: true
    });

  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required"
      });
    }

    const cleanEmail =
      email.trim().toLowerCase();

    const cleanOtp = otp.trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must be exactly 6 digits"
      });
    }

    // --------------------------------
    // Find latest OTP — Redis first, DB fallback
    // --------------------------------

    let otpRecord = null;
    let fromCache = false;

    const cached = await redis.get(otpKey(cleanEmail));

    if (cached) {
      otpRecord = JSON.parse(cached);
      fromCache = true;
    } else {
      // Cache miss: fetch from DB
      const {
        data,
        error: findError
      } = await supabaseAdmin
        .from("email_otps")
        .select("*")
        .eq("email", cleanEmail)
        .eq("verified", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error(findError);

        return res.status(500).json({
          success: false,
          message: "Could not verify OTP"
        });
      }

      otpRecord = data;
    }

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    // --------------------------------
    // Check expiration
    // --------------------------------

    if (new Date(otpRecord.expires_at) < new Date()) {
      // Expired — evict stale cache entry
      await redis.del(otpKey(cleanEmail));

      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    // --------------------------------
    // Compare OTP hash
    // --------------------------------

    const submittedHash = hashOtp(cleanOtp);

    if (submittedHash !== otpRecord.otp_hash) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // --------------------------------
    // Mark OTP verified in DB
    // (only needed when we have a real DB id)
    // --------------------------------

    if (!fromCache || otpRecord.id) {
      await supabaseAdmin
        .from("email_otps")
        .update({ verified: true })
        .eq("id", otpRecord.id);
    } else {
      // Cache record has no id — mark all unverified OTPs for this
      // email as verified so the DB stays consistent.
      await supabaseAdmin
        .from("email_otps")
        .update({ verified: true })
        .eq("email", cleanEmail)
        .eq("verified", false);
    }

    // Evict OTP cache — it's been consumed
    await redis.del(otpKey(cleanEmail));

    // Email-verified notification (fire-and-forget)
    notify({
      userId:    otpRecord.user_id,
      title:     "Email Verified",
      message:   "Your email address has been successfully verified. You can now log in.",
      type:      "email_verification",
      category:  "account",
      priority:  "normal",
      userEmail: cleanEmail,
      userName:  profileData?.name ?? "",
      sendEmail: true,
    });

    // --------------------------------
    // Confirm Supabase user email
    // --------------------------------

    const {
      data: userData,
      error: userError
    } = await supabaseAdmin.auth.admin.updateUserById(
      otpRecord.user_id,
      { email_confirm: true }
    );

    if (userError) {
      console.error(userError);

      return res.status(500).json({
        success: false,
        message: "Could not verify user email"
      });
    }

    // --------------------------------
    // Update profile
    // --------------------------------

    const {
      data: profileData,
      error: profileError
    } = await supabaseAdmin
      .from("profiles")
      .update({ email_verified: true })
      .eq("id", otpRecord.user_id)
      .select("id, name, role")
      .maybeSingle();

    if (profileError) {
      console.error(profileError);

      return res.status(500).json({
        success: false,
        message: "Could not update profile"
      });
    }

    // Evict profile cache — email_verified just changed
    await redis.del(profileKey(otpRecord.user_id));

    // --------------------------------
    // Issue JWT — user is now verified
    // --------------------------------

    const jwtPayload = {
      sub: userData.user.id,
      email: userData.user.email,
      name: profileData?.name ?? null,
      role: profileData?.role ?? "user"
    };

    const accessToken  = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      user: {
        id: userData.user.id,
        email: userData.user.email,
        name: profileData?.name ?? null,
        role: profileData?.role ?? "user"
      },
      tokens: {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
      }
    });

  } catch (error) {
    console.error("Verify OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // --------------------------------
    // 1. Validate email
    // --------------------------------

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // --------------------------------
    // 2. Find user profile
    // --------------------------------

    const {
      data: profile,
      error: profileError
    } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, email_verified")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup error:", profileError);

      return res.status(500).json({
        success: false,
        message: "Could not find account"
      });
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email"
      });
    }

    // --------------------------------
    // 3. Check if already verified
    // --------------------------------

    if (profile.email_verified) {
      return res.status(400).json({
        success: false,
        message: "This email is already verified"
      });
    }

    // --------------------------------
    // 4. Invalidate previous OTPs (DB + cache)
    // --------------------------------

    const { error: invalidateError } =
      await supabaseAdmin
        .from("email_otps")
        .update({ verified: true })
        .eq("email", cleanEmail)
        .eq("verified", false);

    if (invalidateError) {
      console.error("Invalidate OTP error:", invalidateError);

      return res.status(500).json({
        success: false,
        message: "Could not generate a new OTP"
      });
    }

    // Evict stale OTP from cache
    await redis.del(otpKey(cleanEmail));

    // --------------------------------
    // 5. Generate new 6-digit OTP
    // --------------------------------

    const otp = generateOtp();

    const otpHash = hashOtp(otp);

    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // --------------------------------
    // 6. Save new OTP to DB
    // --------------------------------

    const { error: otpError } = await supabaseAdmin
      .from("email_otps")
      .insert({
        user_id:    profile.id,
        email:      cleanEmail,
        otp_hash:   otpHash,
        expires_at: expiresAt.toISOString(),
        attempts:   0,
        verified:   false
      });

    if (otpError) {
      console.error("OTP insert error:", otpError);

      return res.status(500).json({
        success: false,
        message: "Could not create new OTP"
      });
    }

    // --------------------------------
    // 7. Cache new OTP record in Redis
    // --------------------------------

    const otpCachePayload = JSON.stringify({
      id:         null,
      user_id:    profile.id,
      email:      cleanEmail,
      otp_hash:   otpHash,
      expires_at: expiresAt.toISOString(),
      verified:   false
    });

    await redis.set(otpKey(cleanEmail), otpCachePayload, { EX: OTP_TTL_S });

    // --------------------------------
    // 8. Send OTP via Gmail (background)
    // --------------------------------

    sendOtpEmailAsync(cleanEmail, otp, profile.name);

    // --------------------------------
    // 9. Response
    // --------------------------------

    return res.status(200).json({
      success: true,
      message: "A new 6-digit OTP has been sent to your email",
      expiresIn: "10 minutes"
    });

  } catch (error) {
    console.error("Resend OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


export const login = async (req, res) => {
  try {
    const { email, password, totp_code } = req.body;

    // -----------------------------
    // Validate input
    // -----------------------------

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // -----------------------------
    // Login with Supabase Auth
    // -----------------------------

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) {
      console.error("Login error:", error);

      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    if (!data.user) {
      return res.status(401).json({
        success: false,
        message: "Unable to authenticate user"
      });
    }

    // -----------------------------
    // Check email verification — Redis cache first
    // -----------------------------

    let profile = null;

    const cachedProfile = await redis.get(profileKey(data.user.id));

    if (cachedProfile) {
      profile = JSON.parse(cachedProfile);
    } else {
      const {
        data: profileData,
        error: profileError
      } = await supabaseAdmin
        .from("profiles")
        .select("id, name, organization_name, email, role, email_verified")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Profile lookup error:", profileError);

        return res.status(500).json({
          success: false,
          message: "Could not load user profile"
        });
      }

      profile = profileData;

      if (profile) {
        await redis.set(
          profileKey(data.user.id),
          JSON.stringify(profile),
          { EX: PROFILE_TTL_S }
        );
      }
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found"
      });
    }

    // Admin accounts are intentionally blocked from the regular user login
    // flow so the user and admin authentication routes stay separate.
    if (profile.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "This account uses admin login. Please use the admin login page."
      });
    }

    if (!profile.email_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before logging in",
        requiresVerification: true
      });
    }

    // ---------------------------------------------------------------
    // Two-factor challenge (Settings -> Security -> Two-factor auth).
    // Only users who COMPLETED 2FA enrolment are challenged, so nobody
    // is ever locked out by a feature they never turned on. The secret
    // lives in user_settings (owned by the FastAPI backend); we read it
    // with the admin client. Any read error fails OPEN to "2FA off" so a
    // settings-store blip never blocks an otherwise-valid login.
    // ---------------------------------------------------------------
    try {
      const { data: secRow, error: secError } = await supabaseAdmin
        .from("user_settings")
        .select("two_factor_enabled,totp_secret")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!secError && secRow?.two_factor_enabled && secRow?.totp_secret) {
        const code = String(totp_code || "").trim();
        if (!code) {
          // Credentials were correct but the second factor is still needed.
          return res.status(200).json({
            success: true,
            requires2FA: true,
            message: "Enter the 6-digit code from your authenticator app",
          });
        }
        if (!verifyTotp(secRow.totp_secret, code)) {
          return res.status(401).json({
            success: false,
            bad2FACode: true,
            message: "That authentication code is not valid. Please try again.",
          });
        }
      }
    } catch (e) {
      console.error("2FA login check failed (allowing login):", e.message);
    }

    // -----------------------------
    // Successful login — issue JWT
    // -----------------------------

    const jwtPayload = {
      sub:   data.user.id,
      email: data.user.email,
      name:  profile.name,
      role:  profile.role
    };

    const accessToken  = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    // Send login notification in background
    sendLoginEmailAsync(data.user.email, profile.name);

    // Login security email — deliberately NOT written to the notification
    // bell (inApp: false): every login would flood the icon with old events.
    notify({
      userId:    data.user.id,
      title:     "New Login Detected",
      message:   `A new login was detected on your account.`,
      type:      "login",
      category:  "security",
      priority:  "normal",
      actionUrl: "/dashboard",
      userEmail: data.user.email,
      userName:  profile.name,
      sendEmail: true,
      inApp:     false,
    });

    // Login activity event (fire-and-forget, retention analytics). The device
    // hints let Settings → Security show a real "recent sign-in activity" list.
    trackActivity(data.user.id, "user_login", {
      method: "password",
      device: describeUserAgent(req.headers["user-agent"] || ""),
      ip: clientIp(req),
    });

    // Feedback prompt eligibility — increments login_count on profiles and
    // decides whether to auto-open the feedback popup this session. Must never
    // block a successful login, so failures degrade to "don't show".
    let showFeedback = false;
    try {
      const prompt = await registerLoginAndCheckPrompt(data.user.id);
      showFeedback = !!prompt.showFeedback;
    } catch (e) {
      console.error("login feedback prompt check failed:", e.message);
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",

      user: {
        id:              data.user.id,
        email:           data.user.email,
        name:            profile.name,
        organizationName: profile.organization_name,
        role:            profile.role,
        emailVerified:   profile.email_verified
      },

      tokens: {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
      },

      showFeedback
    });

  } catch (error) {
    console.error("Login server error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

/**
 * Admin login.
 *
 * The admin must be a REAL Supabase Auth user.
 *
 * Flow:
 * 1. Check the admin email/password.
 * 2. Authenticate against Supabase Auth.
 * 3. Use the REAL Supabase Auth UUID.
 * 4. Load the matching profiles row.
 * 5. Require role === "admin".
 * 6. Issue our application JWT using that REAL UUID as `sub`.
 *
 * IMPORTANT:
 * Never use a fake/static user id here.
 * predictions.user_id is a UUID column.
 */
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // --------------------------------
    // 1. Validate input
    // --------------------------------
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // --------------------------------
    // 2. Optional admin-email guard
    // --------------------------------
    //
    // ADMIN_EMAIL is used only to restrict
    // which account may enter the admin login.
    //
    // Authentication itself is still performed
    // by Supabase Auth.
    //
    if (cleanEmail !== STATIC_ADMIN_EMAIL.toLowerCase()) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // --------------------------------
    // 3. Authenticate against Supabase
    // --------------------------------
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError || !authData?.user) {
      console.error(
        "Admin Supabase authentication failed:",
        authError?.message || "No user returned"
      );

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const authUser = authData.user;

    // --------------------------------
    // 4. IMPORTANT:
    //    Use the REAL Supabase Auth UUID
    // --------------------------------
    const userId = authUser.id;

    // Extra safety check.
    // Supabase Auth IDs must always be UUIDs.
    if (
      !userId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId
      )
    ) {
      console.error(
        "Admin login returned an invalid Supabase user UUID:",
        userId
      );

      return res.status(500).json({
        success: false,
        message: "Invalid administrator account configuration",
      });
    }

    // --------------------------------
    // 5. Load the matching profile
    // --------------------------------
    //
    // profiles.id MUST be the same UUID as
    // auth.users.id.
    //
    let profile = null;

    const cachedProfile = await redis.get(profileKey(userId));

    if (cachedProfile) {
      try {
        profile = JSON.parse(cachedProfile);
      } catch (cacheError) {
        console.warn(
          "Invalid admin profile cache. Ignoring cache:",
          cacheError
        );

        await redis.del(profileKey(userId));
      }
    }

    if (!profile) {
      const {
        data: profileData,
        error: profileError,
      } = await supabaseAdmin
        .from("profiles")
        .select(
          "id, name, organization_name, email, role, email_verified"
        )
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        console.error(
          "Admin profile lookup error:",
          profileError
        );

        return res.status(500).json({
          success: false,
          message: "Could not load administrator profile",
        });
      }

      profile = profileData;
    }

    // --------------------------------
    // 6. Profile must exist
    // --------------------------------
    if (!profile) {
      console.error(
        "Admin Auth user has no matching profile:",
        userId
      );

      return res.status(403).json({
        success: false,
        message: "Administrator profile is not configured",
      });
    }

    // --------------------------------
    // 7. Require admin role
    // --------------------------------
    if (String(profile.role || "").toLowerCase() !== "admin") {
      console.warn(
        "Admin login rejected because profile role is not admin:",
        {
          userId,
          email: cleanEmail,
          role: profile.role,
        }
      );

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // --------------------------------
    // 8. Make sure profile email is correct
    // --------------------------------
    //
    // Do not replace the UUID.
    // The UUID must always remain authUser.id.
    //
    const adminName =
      profile.name ||
      authUser.user_metadata?.name ||
      "System Administrator";

    const adminEmail =
      profile.email ||
      authUser.email ||
      cleanEmail;

    // --------------------------------
    // 9. Cache the REAL profile
    // --------------------------------
    const normalizedProfile = {
      id: userId,
      name: adminName,
      organization_name:
        profile.organization_name || "Admin",
      email: adminEmail,
      role: "admin",
      email_verified:
        profile.email_verified ?? true,
    };

    await redis.set(
      profileKey(userId),
      JSON.stringify(normalizedProfile),
      {
        EX: PROFILE_TTL_S,
      }
    );

    // --------------------------------
    // 10. Create application JWT
    // --------------------------------
    //
    // CRITICAL:
    //
    // sub = REAL Supabase UUID
    //
    // NEVER:
    // sub = "admin-static-user"
    //
    const jwtPayload = {
      sub: userId,
      email: adminEmail,
      name: adminName,
      role: "admin",
    };

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    // --------------------------------
    // 11. Login notification
    // --------------------------------
    sendLoginEmailAsync(adminEmail, adminName);

    // Admin login security email — email-only, never a bell row.
    notify({
      userId:    userId,
      title:     "Admin Login Detected",
      message:   `Admin account login detected.`,
      type:      "login",
      category:  "security",
      priority:  "high",
      userEmail: adminEmail,
      userName:  adminName,
      sendEmail: true,
      inApp:     false,
    });

    // Login activity event (fire-and-forget, retention analytics)
    trackActivity(userId, "user_login", { method: "admin" });

    // --------------------------------
    // 12. Response
    // --------------------------------
    return res.status(200).json({
      success: true,
      message: "Admin login successful",

      user: {
        id: userId,
        email: adminEmail,
        name: adminName,
        organizationName:
          normalizedProfile.organization_name,
        role: "admin",
        emailVerified:
          normalizedProfile.email_verified,
      },

      tokens: {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn:
          process.env.JWT_EXPIRES_IN || "7d",
      },
    });
  } catch (error) {
    console.error(
      "Admin login server error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // --------------------------------
    // 1. Validate email
    // --------------------------------
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address"
      });
    }

    // --------------------------------
    // 2. Find account
    // --------------------------------
    const {
      data: profile,
      error: profileError
    } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, email_verified")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup error:", profileError);

      return res.status(500).json({
        success: false,
        message: "Could not process request"
      });
    }

    // Do not reveal whether an account exists
    if (!profile) {
      return res.status(200).json({
        success: true,
        message:
          "If an account with that email exists, a password reset OTP has been sent"
      });
    }

    // --------------------------------
    // 3. Account must be verified
    // --------------------------------
    if (!profile.email_verified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email address before resetting your password"
      });
    }

    // --------------------------------
    // 4. Generate OTP
    // --------------------------------
    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    const expiresAt = new Date(
      Date.now() + OTP_TTL_MS
    );

    // --------------------------------
    // 5. Store reset OTP in Redis
    // --------------------------------
    const resetOtpPayload = JSON.stringify({
      user_id: profile.id,
      email: cleanEmail,
      otp_hash: otpHash,
      expires_at: expiresAt.toISOString()
    });

    await redis.set(
      passwordResetOtpKey(cleanEmail),
      resetOtpPayload,
      {
        EX: OTP_TTL_S
      }
    );

    // --------------------------------
    // 6. Send OTP
    // --------------------------------
    sendOtpEmailAsync(
      cleanEmail,
      otp,
      profile.name
    );

    // --------------------------------
    // 7. Response
    // --------------------------------
    return res.status(200).json({
      success: true,
      message:
        "A 6-digit password reset OTP has been sent to your email",
      expiresIn: "10 minutes"
    });

  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const verifyResetPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // --------------------------------
    // 1. Validate input
    // --------------------------------
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required"
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must be exactly 6 digits"
      });
    }

    // --------------------------------
    // 2. Get OTP from Redis
    // --------------------------------
    const cached = await redis.get(
      passwordResetOtpKey(cleanEmail)
    );

    if (!cached) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    const otpRecord = JSON.parse(cached);

    // --------------------------------
    // 3. Check expiration
    // --------------------------------
    if (
      new Date(otpRecord.expires_at) < new Date()
    ) {
      await redis.del(
        passwordResetOtpKey(cleanEmail)
      );

      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    // --------------------------------
    // 4. Compare OTP
    // --------------------------------
    const submittedHash = hashOtp(cleanOtp);

    if (
      submittedHash !== otpRecord.otp_hash
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // --------------------------------
    // 5. OTP is consumed
    // --------------------------------
    await redis.del(
      passwordResetOtpKey(cleanEmail)
    );

    // --------------------------------
    // 6. Generate temporary reset token
    // --------------------------------
    const resetToken = crypto
      .randomBytes(32)
      .toString("hex");

    // Reset token valid for 10 minutes
    await redis.set(
      passwordResetTokenKey(resetToken),
      JSON.stringify({
        user_id: otpRecord.user_id,
        email: cleanEmail
      }),
      {
        EX: 10 * 60
      }
    );

    // --------------------------------
    // 7. Response
    // --------------------------------
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      resetToken,
      expiresIn: "10 minutes"
    });

  } catch (error) {
    console.error(
      "Verify reset OTP error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
export const resendResetPasswordOtp = async (
  req,
  res
) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // --------------------------------
    // Find account
    // --------------------------------
    const {
      data: profile,
      error: profileError
    } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, email_verified")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Reset OTP profile lookup error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message: "Could not process request"
      });
    }

    if (!profile) {
      return res.status(200).json({
        success: true,
        message:
          "If an account with that email exists, a new OTP has been sent"
      });
    }

    if (!profile.email_verified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email address first"
      });
    }

    // --------------------------------
    // Generate new OTP
    // --------------------------------
    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    const expiresAt = new Date(
      Date.now() + OTP_TTL_MS
    );

    // --------------------------------
    // Replace old OTP
    // --------------------------------
    const resetOtpPayload = JSON.stringify({
      user_id: profile.id,
      email: cleanEmail,
      otp_hash: otpHash,
      expires_at: expiresAt.toISOString()
    });

    await redis.set(
      passwordResetOtpKey(cleanEmail),
      resetOtpPayload,
      {
        EX: OTP_TTL_S
      }
    );

    // --------------------------------
    // Invalidate previous reset token
    // --------------------------------
    // The previous token remains independently
    // protected by its expiration.

    // --------------------------------
    // Send OTP
    // --------------------------------
    sendOtpEmailAsync(
      cleanEmail,
      otp,
      profile.name
    );

    return res.status(200).json({
      success: true,
      message:
        "A new password reset OTP has been sent",
      expiresIn: "10 minutes"
    });

  } catch (error) {
    console.error(
      "Resend reset OTP error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
export const resetPassword = async (req, res) => {
  try {
    const {
      resetToken,
      newPassword,
      confirmPassword
    } = req.body;

    // --------------------------------------
    // 1. Validate request
    // --------------------------------------
    if (!resetToken) {
      return res.status(401).json({
        success: false,
        message: "Password reset token is required"
      });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password and confirm password are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters"
      });
    }

    // --------------------------------------
    // 2. Get reset token from Redis
    // --------------------------------------
    const cached = await redis.get(
      passwordResetTokenKey(resetToken)
    );

    if (!cached) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid or expired password reset session"
      });
    }

    const resetData = JSON.parse(cached);

    // --------------------------------------
    // 3. Update Supabase password
    // --------------------------------------
    const {
      error: updateError
    } = await supabaseAdmin.auth.admin.updateUserById(
      resetData.user_id,
      {
        password: newPassword
      }
    );

    if (updateError) {
      console.error(
        "Password update error:",
        updateError
      );

      return res.status(400).json({
        success: false,
        message: "Could not update password"
      });
    }

    // --------------------------------------
    // 4. Consume reset token
    // --------------------------------------
    await redis.del(
      passwordResetTokenKey(resetToken)
    );

    // --------------------------------------
    // 5. Clear profile cache
    // --------------------------------------
    await redis.del(
      profileKey(resetData.user_id)
    );

    // --------------------------------------
    // 6. Success
    // --------------------------------------
    return res.status(200).json({
      success: true,
      message:
        "Password has been reset successfully"
    });

  } catch (error) {
    console.error(
      "Reset password error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


/**
 * Shared by the Google and Microsoft OAuth callbacks.
 *
 * Passport's user object only carries what the strategy config
 * pulls off the provider profile (typically id/email/name) — it
 * does NOT carry `role`, which every JWT payload in this file
 * requires. So, exactly like `login`, we look the profile up
 * (Redis first, DB fallback) and sign real tokens from it.
 *
 * If no profile exists yet for this OAuth user, one is created
 * with role "user" and email_verified true (the provider already
 * verified the email).
 */
export const issueTokensForOAuthUser = async (oauthUser, provider = "oauth") => {
  const userId = oauthUser.id;
  const email = oauthUser.email?.trim().toLowerCase();
  const name = oauthUser.name || email?.split("@")[0] || "User";

  let profile = null;

  const cached = await redis.get(profileKey(userId));
  if (cached) {
    profile = JSON.parse(cached);
  } else {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, organization_name, email, role, email_verified")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("OAuth profile lookup error:", error);
      throw new Error("Could not load user profile");
    }

    profile = data;
  }

  // First time this OAuth account has signed in — create a profile row.
  if (!profile) {
    const { data: created, error: createError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        name,
        organization_name: "",
        email,
        role: "user",
        email_verified: true,
      })
      .select("id, name, organization_name, email, role, email_verified")
      .single();

    if (createError) {
      console.error("OAuth profile create error:", createError);
      throw new Error("Could not create user profile");
    }

    profile = created;

    // First sign-in for this OAuth account — record registration
    // (fire-and-forget, retention analytics).
    trackActivity(userId, "user_registered", { source: provider });
  }

  if (profile.role === "admin") {
    // Same rule as password login: admins never get tokens from this path.
    throw new Error("This account uses admin login");
  }

  await redis.set(profileKey(userId), JSON.stringify(profile), {
    EX: PROFILE_TTL_S,
  });

  const jwtPayload = {
    sub: userId,
    email: profile.email,
    name: profile.name,
    role: profile.role,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = signRefreshToken(jwtPayload);

  // Login activity event (fire-and-forget, retention analytics).
  trackActivity(userId, "user_login", { method: provider });

  // Feedback prompt eligibility — same logic (and SAME profiles row) as the
  // email/password login, so Google/Microsoft share one login counter. Never
  // blocks a successful sign-in.
  let showFeedback = false;
  try {
    const prompt = await registerLoginAndCheckPrompt(userId);
    showFeedback = !!prompt.showFeedback;
  } catch (e) {
    console.error("oauth feedback prompt check failed:", e.message);
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    profile,
    showFeedback,
  };
};

/**
 * Explicit logout.
 *
 * The auth service is stateless (JWT access tokens — nothing to revoke
 * server-side), so this endpoint exists to record the `user_logout`
 * activity event for retention analytics. Browser/tab closure cannot be
 * detected reliably and is deliberately NOT tracked (spec §12) — only
 * explicit application logout.
 */
export const logout = async (req, res) => {
  try {
    const userId = String(req.user?.sub || "").trim();

    if (userId) {
      trackActivity(userId, "user_logout", { method: "explicit" });
    }

    return res.status(200).json({ success: true, message: "Logged out" });
  } catch (error) {
    // Logout must never fail the client — the local session is cleared
    // on the frontend regardless.
    console.error("Logout error:", error);
    return res.status(200).json({ success: true, message: "Logged out" });
  }
};

export const getMe = async (req, res) => {
  try {
    // --------------------------------
    // 1. Get user identity from JWT
    // --------------------------------
    const userId = String(req.user?.sub || "").trim();

    const userEmail = req.user?.email
      ? String(req.user.email).trim().toLowerCase()
      : null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    // --------------------------------
    // 2. Validate UUID
    // --------------------------------
    //
    // This prevents fake values such as:
    // "admin-static-user"
    //
    // from ever reaching Supabase.
    //
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId
      );

    if (!isUuid) {
      console.error(
        "getMe rejected non-UUID JWT subject:",
        userId
      );

      return res.status(401).json({
        success: false,
        message: "Invalid user identity in authentication token",
      });
    }

    // --------------------------------
    // 3. Redis cache first
    // --------------------------------
    const cached = await redis.get(
      profileKey(userId)
    );

    if (cached) {
      try {
        const profile = JSON.parse(cached);

        return res.status(200).json({
          success: true,
          user: {
            id: profile.id,
            name: profile.name,
            organizationName:
              profile.organization_name,
            email: profile.email,
            role: profile.role,
            emailVerified:
              profile.email_verified,
          },
        });
      } catch (cacheError) {
        console.warn(
          "Invalid profile cache. Removing it:",
          cacheError
        );

        await redis.del(profileKey(userId));
      }
    }

    // --------------------------------
    // 4. Database fallback
    // --------------------------------
    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, name, organization_name, email, role, email_verified"
      )
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error(
        "getMe profile error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message: "Could not load user profile",
      });
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // --------------------------------
    // 5. Cache profile
    // --------------------------------
    await redis.set(
      profileKey(userId),
      JSON.stringify(profile),
      {
        EX: PROFILE_TTL_S,
      }
    );

    // --------------------------------
    // 6. Return profile
    // --------------------------------
    return res.status(200).json({
      success: true,
      user: {
        id: profile.id,
        name: profile.name,
        organizationName:
          profile.organization_name,
        email: profile.email,
        role: profile.role,
        emailVerified:
          profile.email_verified,
      },
    });
  } catch (error) {
    console.error(
      "getMe error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


/**
 * Change the password of an existing account.
 *
 * Reached ONLY through the internal service-to-service route
 * (POST /api/internal/change-password, guarded by INTERNAL_API_SECRET),
 * which the FastAPI backend calls after it has validated the user's JWT.
 * Because the caller is a trusted backend, the user id is taken from the
 * body — but the CURRENT password is still verified here before the update,
 * so a stolen/leaked internal secret alone can never reset someone's
 * password without also knowing their existing one.
 *
 * OAuth-only accounts (Google/Microsoft) have no password to verify; signIn
 * fails for them and we return a clear, actionable message.
 */
export const changePassword = async (req, res) => {
  try {
    const { user_id, current_password, new_password } = req.body || {};

    if (!user_id || !current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "user_id, current_password and new_password are required",
      });
    }

    if (String(new_password).length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    // 1. Resolve the account's email (needed to verify the current password).
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(user_id);

    if (userError || !userData?.user) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    const email = userData.user.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "This account has no email password to change",
      });
    }

    // 2. Verify the CURRENT password by attempting a real sign-in.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: String(current_password),
    });

    if (signInError) {
      return res.status(401).json({
        success: false,
        message: "Your current password is incorrect",
      });
    }

    // 3. Apply the new password with the admin client.
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: String(new_password),
      });

    if (updateError) {
      console.error("changePassword update error:", updateError);
      return res.status(400).json({
        success: false,
        message: "Could not update password",
      });
    }

    // 4. Drop the cached profile so the next read reflects the change.
    await redis.del(profileKey(user_id));

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("changePassword error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ── POST /api/internal/change-email ──────────────────────────────────────────
/**
 * Change an account's sign-in email. Mirrors changePassword's trust model:
 * FastAPI already validated the caller's JWT, and here the auth service still
 * re-verifies the CURRENT password before it touches the email. email_confirm
 * is true because the owner proved account possession via that password.
 * Body: { user_id, current_password, new_email }.
 */
export const changeEmail = async (req, res) => {
  try {
    const { user_id, current_password, new_email } = req.body || {};

    if (!user_id || !current_password || !new_email) {
      return res.status(400).json({
        success: false,
        message: "user_id, current_password and new_email are required",
      });
    }

    const email = String(new_email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address" });
    }

    // 1. Load the account so we know its CURRENT email (to verify the password).
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(user_id);
    if (userError || !userData?.user) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }
    const currentEmail = userData.user.email;
    if (!currentEmail) {
      return res.status(400).json({
        success: false,
        message: "This account has no email password to verify",
      });
    }
    if (currentEmail.toLowerCase() === email) {
      return res.status(400).json({
        success: false,
        message: "That is already your sign-in email",
      });
    }

    // 2. Verify the CURRENT password with a real sign-in.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: String(current_password),
    });
    if (signInError) {
      return res.status(401).json({
        success: false,
        message: "Your current password is incorrect",
      });
    }

    // 3. Apply the new email with the admin client (already confirmed).
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        email,
        email_confirm: true,
      });
    if (updateError) {
      console.error("changeEmail update error:", updateError);
      return res.status(409).json({
        success: false,
        message: "Could not update email (it may already be in use)",
      });
    }

    // 4. Drop the cached profile so the next read reflects the change.
    await redis.del(profileKey(user_id));

    return res.status(200).json({
      success: true,
      message: "Email updated successfully",
    });
  } catch (error) {
    console.error("changeEmail error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── POST /api/internal/delete-account ────────────────────────────────────────
/**
 * Permanently delete an account's Auth user. FastAPI validated the JWT; the
 * service re-checks the CURRENT password so a stolen/expired token alone can't
 * wipe an account. FastAPI cascades the app rows/storage AFTER this returns
 * 200, so a wrong password here leaves everything intact.
 * Body: { user_id, password }.
 */
export const deleteAccount = async (req, res) => {
  try {
    const { user_id, password } = req.body || {};
    if (!user_id || !password) {
      return res.status(400).json({
        success: false,
        message: "user_id and password are required",
      });
    }

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(user_id);
    if (userError || !userData?.user) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }
    const email = userData.user.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "This account has no email password to verify",
      });
    }

    // Verify the CURRENT password before destroying anything.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: String(password),
    });
    if (signInError) {
      return res.status(401).json({
        success: false,
        message: "Your password is incorrect",
      });
    }

    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      console.error("deleteAccount error:", deleteError);
      return res.status(400).json({
        success: false,
        message: "Could not delete the account",
      });
    }

    await redis.del(profileKey(user_id));

    return res.status(200).json({
      success: true,
      message: "Account deleted",
    });
  } catch (error) {
    console.error("deleteAccount error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};