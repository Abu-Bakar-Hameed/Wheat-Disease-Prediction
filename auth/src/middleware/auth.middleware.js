import crypto from "crypto";
import { verifyToken } from "../utils/jwt.js";
import { supabaseAdmin } from "../config/supabase.js";
import redis from "../config/redis.js";

// ── Token revocation ("sign out everywhere" / password-or-email change) ──────
// JWTs here are stateless, so the only honest way to end every live session
// is a threshold: user_settings.password_changed_at is stamped whenever the
// user changes their password/email or hits "sign out everywhere", and ANY
// token whose iat predates that stamp is rejected. This MUST fail OPEN — the
// column may not exist yet, Redis may be down, the query may error; none of
// those should lock a legitimate user out of an app that was working before.
const REVOCATION_TTL_S = 60;

const revocationKey = (userId) => `pwd_changed_at:${userId}`;

async function cacheRevocation(key, value) {
  try {
    await redis.set(key, value, { EX: REVOCATION_TTL_S });
  } catch {
    /* cache write is best-effort */
  }
}

async function passwordChangedEpoch(userId) {
  if (!userId) return null;
  const key = revocationKey(userId);
  try {
    const cached = await redis.get(key);
    if (cached === "none") return null;
    if (cached) {
      const n = Number(cached);
      if (!Number.isNaN(n)) return n;
    }
  } catch {
    /* Redis unavailable — fall through to the DB, fail open */
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("user_settings")
      .select("password_changed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null; // missing column/table → fail open, don't cache
    const ts = data?.password_changed_at;
    if (!ts) {
      await cacheRevocation(key, "none");
      return null;
    }
    const epoch = Math.floor(new Date(ts).getTime() / 1000);
    await cacheRevocation(key, String(epoch));
    return epoch;
  } catch {
    return null;
  }
}

/**
 * Protect a route by requiring a valid Bearer JWT in the
 * Authorization header.
 *
 * On success, attaches the decoded payload to req.user.
 * On failure, returns 401.
 */
export const requireAuth = async (req, res, next) => {
  let decoded;
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization header missing or malformed"
      });
    }

    const token = authHeader.split(" ")[1];

    decoded = verifyToken(token);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired"
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid token"
    });
  }

  // Reject tokens issued before the account's last credential change.
  const iat = typeof decoded.iat === "number" ? decoded.iat : 0;
  const changedAt = await passwordChangedEpoch(decoded.sub);
  if (changedAt && iat && iat < changedAt) {
    return res.status(401).json({
      success: false,
      code: "session_revoked",
      message: "Your session has ended. Please sign in again."
    });
  }

  // Attach decoded payload so downstream handlers can use it
  req.user = decoded;
  next();
};

/**
 * Optional role guard — use after requireAuth.
 * e.g. requireRole("admin")
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient permissions"
      });
    }
    next();
  };
};

/**
 * Gate the admin login endpoint behind a shared secret key.
 *
 * This runs BEFORE any credential/DB work: the caller must present
 * the correct key (via the X-Admin-Secret-Key header) or the request
 * is rejected immediately. It is an extra layer on top of normal
 * email/password + role checks in adminLogin - not a replacement
 * for them.
 *
 * The comparison is constant-time to avoid leaking key length/prefix
 * information through response timing.
 */
export const requireAdminSecret = (req, res, next) => {
  const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;

  if (!ADMIN_SECRET_KEY) {
    console.error("ADMIN_SECRET_KEY environment variable is not set");

    return res.status(500).json({
      success: false,
      message: "Admin authentication is not configured"
    });
  }

  const providedKey = req.headers["x-admin-secret-key"];

  if (!providedKey || typeof providedKey !== "string") {
    return res.status(401).json({
      success: false,
      message: "Admin secret key is required"
    });
  }

  const providedBuffer = Buffer.from(providedKey, "utf8");
  const expectedBuffer = Buffer.from(ADMIN_SECRET_KEY, "utf8");

  // timingSafeEqual throws if buffer lengths differ, so gate on
  // length first - mismatched length is not a secret worth timing-
  // attacking anyway.
  const isValid =
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);

  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin secret key"
    });
  }

  next();
};
