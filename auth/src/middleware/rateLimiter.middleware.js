import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redis from "../config/redis.js";

// --------------------------------------------------------
// Redis-backed rate limiters
//
// Using a shared Redis store means:
//   - Limits survive server restarts
//   - Work correctly across multiple instances / replicas
//   - No in-memory state to worry about
// --------------------------------------------------------

/**
 * Generic rate limiter factory.
 * Creates a limiter backed by Redis with a custom window,
 * max requests, key prefix, and message.
 *
 * @param {number}  windowMs   - Time window in milliseconds
 * @param {number}  max        - Max requests allowed per window
 * @param {string}  message    - Human-readable error message
 * @param {string}  prefix     - Redis key prefix (unique per limiter)
 */
const createLimiter = (windowMs, max, message, prefix, keyBuilder = undefined) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,   // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,     // Disable X-RateLimit-* headers
    message: {
      success: false,
      message
    },
    keyGenerator: keyBuilder ?? ((req) => {
      const forwarded = req.headers["x-forwarded-for"];
      const ip = Array.isArray(forwarded)
        ? forwarded[0]
        : typeof forwarded === "string"
          ? forwarded.split(",")[0].trim()
          : req.ip || "unknown";
      return `${ip}`;
    }),
    store: new RedisStore({
      // rate-limit-redis v4 needs sendCommand to talk to the client
      sendCommand: (...args) => redis.sendCommand(args),
      prefix: `rl:${prefix}:`
    })
  });

const createEmailScopedLimiter = (windowMs, max, message, prefix) =>
  createLimiter(windowMs, max, message, prefix, (req) => {
    const incoming = req.body?.email ?? req.query?.email ?? "";
    const email = String(incoming).trim().toLowerCase();
    const forwarded = req.headers["x-forwarded-for"];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === "string"
        ? forwarded.split(",")[0].trim()
        : req.ip || "unknown";

    return email ? `${ip}:${email}` : `${ip}:unknown-email`;
  });

/**
 * Registration — 10 attempts per 15 minutes per IP.
 * Prevents account-creation spam.
 */
export const registerLimiter = createLimiter(
  15 * 60 * 1000,
  10,
  "Too many registration attempts. Please try again in 15 minutes.",
  "register"
);

/**
 * User login — 10 attempts per 15 minutes per email/IP pair.
 * Each email address gets its own independent limit so one user cannot
 * trigger a global block for everyone else.
 */
export const loginLimiter = createEmailScopedLimiter(
  15 * 60 * 1000,
  10,
  "Too many login attempts. Please try again in 15 minutes.",
  "login"
);

/**
 * Admin login — separate bucket from normal user login.
 * This ensures admin attempts are isolated from user email attempts.
 */
export const adminLoginLimiter = createEmailScopedLimiter(
  15 * 60 * 1000,
  10,
  "Too many admin login attempts. Please try again in 15 minutes.",
  "admin-login"
);

/**
 * OTP verification — 10 attempts per 10 minutes per IP.
 */
export const verifyOtpLimiter = createLimiter(
  10 * 60 * 1000,
  10,
  "Too many OTP attempts. Please try again in 10 minutes.",
  "verify-otp"
);

/**
 * Resend OTP — 5 requests per 10 minutes per IP.
 * Prevents OTP email flooding.
 */
export const resendOtpLimiter = createLimiter(
  10 * 60 * 1000,
  5,
  "Too many resend requests. Please try again in 10 minutes.",
  "resend-otp"
);

/**
 * Forgot password — 5 requests per 15 minutes per IP.
 * Prevents reset-link spam.
 */
export const forgotPasswordLimiter = createLimiter(
  15 * 60 * 1000,
  5,
  "Too many password reset requests. Please try again in 15 minutes.",
  "forgot-password"
);
