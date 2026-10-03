import express from "express";
import passport from "passport";

import {
  register,
  verifyOtp,
  resendOtp,
  login,
  adminLogin,
  forgotPassword,
  verifyResetPasswordOtp,
  resendResetPasswordOtp,
  resetPassword,
  getMe,
  issueTokensForOAuthUser,
  logout,
} from "../controllers/auth.controller.js";

import { sendLoginEmail } from "../services/email.service.js";

import {
  requireAuth,
  requireAdminSecret,
} from "../middleware/auth.middleware.js";

import {
  registerLimiter,
  loginLimiter,
  adminLoginLimiter,
  verifyOtpLimiter,
  resendOtpLimiter,
  forgotPasswordLimiter,
} from "../middleware/rateLimiter.middleware.js";

const router = express.Router();

// ========================================================
// OAuth Login Email Helper
// ========================================================

const sendOAuthLoginEmailAsync = (email, name, provider) => {
  sendLoginEmail(email, name).catch((error) => {
    console.error(
      `❌ Background ${provider} login email failed for ${email}:`,
      error.message
    );
  });
};

// ========================================================
// GOOGLE LOGIN
// ========================================================

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

// ========================================================
// GOOGLE CALLBACK
// ========================================================

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect:
      `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
  }),
  async (req, res) => {
    const user = req.user;

    try {
      const { accessToken, refreshToken, expiresIn, profile, showFeedback } =
        await issueTokensForOAuthUser(user, "google");

      sendOAuthLoginEmailAsync(profile.email, profile.name, "Google");

      const params = new URLSearchParams({
        userId: profile.id,
        email: profile.email,
        name: profile.name || "",
        provider: "google",
        accessToken,
        refreshToken: refreshToken || "",
        expiresIn: String(expiresIn),
        showFeedback: showFeedback ? "1" : "0",
      });

      res.redirect(
        `${process.env.FRONTEND_URL}/oauth-success?${params.toString()}`
      );
    } catch (err) {
      console.error("❌ Failed to issue tokens after Google login:", err);
      res.redirect(
        `${process.env.FRONTEND_URL}/login?error=google_token_issue_failed`
      );
    }
  }
);

// ========================================================
// MICROSOFT LOGIN
// ========================================================

router.get(
  "/microsoft",
  passport.authenticate("microsoft")
);

// ========================================================
// MICROSOFT CALLBACK
// ========================================================

router.get(
  "/microsoft/callback",
  passport.authenticate("microsoft", {
    session: false,
    failureRedirect:
      `${process.env.FRONTEND_URL}/login?error=microsoft_auth_failed`,
  }),
  async (req, res) => {
    const user = req.user;

    try {
      const { accessToken, refreshToken, expiresIn, profile, showFeedback } =
        await issueTokensForOAuthUser(user, "microsoft");

      sendOAuthLoginEmailAsync(profile.email, profile.name, "Microsoft");

      const params = new URLSearchParams({
        userId: profile.id,
        email: profile.email,
        name: profile.name || "",
        provider: "microsoft",
        accessToken,
        refreshToken: refreshToken || "",
        expiresIn: String(expiresIn),
        showFeedback: showFeedback ? "1" : "0",
      });

      res.redirect(
        `${process.env.FRONTEND_URL}/oauth-success?${params.toString()}`
      );
    } catch (err) {
      console.error("❌ Failed to issue tokens after Microsoft login:", err);
      res.redirect(
        `${process.env.FRONTEND_URL}/login?error=microsoft_token_issue_failed`
      );
    }
  }
);

// ========================================================
// REGISTER
// ========================================================

router.post("/register", registerLimiter, register);

// ========================================================
// VERIFY REGISTRATION OTP
// ========================================================

router.post("/verify-otp", verifyOtpLimiter, verifyOtp);

// ========================================================
// RESEND REGISTRATION OTP
// ========================================================

router.post("/resend-otp", resendOtpLimiter, resendOtp);

// ========================================================
// USER LOGIN
// ========================================================

router.post("/login", loginLimiter, login);

// ========================================================
// ADMIN LOGIN
// ========================================================

router.post(
  "/admin/login",
  requireAdminSecret,
  adminLoginLimiter,
  adminLogin
);

// ========================================================
// FORGOT PASSWORD
// ========================================================

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);

// ========================================================
// VERIFY PASSWORD RESET OTP
// ========================================================

router.post("/verify-reset-otp", verifyOtpLimiter, verifyResetPasswordOtp);

// ========================================================
// RESEND PASSWORD RESET OTP
// ========================================================

router.post("/resend-reset-otp", resendOtpLimiter, resendResetPasswordOtp);

// ========================================================
// RESET PASSWORD
// ========================================================

router.post("/reset-password", resetPassword);

// ========================================================
// CURRENT USER
// ========================================================

router.get("/me", requireAuth, getMe);

// ========================================================
// LOGOUT
// Records the explicit sign-out (user_logout activity event)
// for retention analytics; the auth service is stateless.
// ========================================================

router.post("/logout", requireAuth, logout);

// ========================================================
// EXPORT ROUTER
// ========================================================

export default router;