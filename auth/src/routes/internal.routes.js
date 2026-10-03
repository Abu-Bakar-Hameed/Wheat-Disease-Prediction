/**
 * WheatGuard AI – Internal Service-to-Service Routes
 *
 * These routes are called ONLY by the FastAPI backend (not the browser).
 * They are protected by a shared INTERNAL_API_SECRET header — never by a
 * user JWT — so they must never be exposed to the public internet directly.
 *
 * POST /api/internal/disease-alert  – trigger high-risk email for a prediction
 */

import express from "express";
import { sendHighRiskAlert, sendReminderAlert } from "../services/notification.service.js";
import { changePassword, changeEmail, deleteAccount } from "../controllers/auth.controller.js";

const router = express.Router();

// ── Shared secret middleware ──────────────────────────────────────────────────

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "";

if (!INTERNAL_SECRET) {
  // Read once at import time, so adding the key to .env only takes effect
  // after a restart. Say it loudly rather than failing as a mystery 503.
  console.warn(
    "\u26a0\ufe0f  INTERNAL_API_SECRET is not set \u2014 /api/internal/* will reject every " +
      "call and HIGH/CRITICAL disease alert emails will not be sent. " +
      "Add it to auth/.env (matching back/.env) and restart this service."
  );
} else {
  console.log("\ud83dd\udc99 Internal service-to-service endpoint armed (secret loaded).");
}

function requireInternalSecret(req, res, next) {
  const provided =
    req.headers["x-internal-secret"] ||
    req.headers["x-api-secret"] ||
    "";

  if (!INTERNAL_SECRET) {
    // Secret not configured — block all calls for safety
    return res.status(503).json({
      success: false,
      message: "Internal API secret not configured on this server.",
    });
  }

  if (provided !== INTERNAL_SECRET) {
    return res.status(401).json({
      success: false,
      message: "Invalid internal API secret.",
    });
  }

  next();
}

router.use(requireInternalSecret);

// ── POST /api/internal/disease-alert ─────────────────────────────────────────

/**
 * Trigger a high-risk disease alert email + in-app notification.
 *
 * Body:
 *   user_id        string  – Supabase auth UUID of the user
 *   user_email     string  – recipient email address
 *   user_name      string  – recipient display name
 *   prediction_id  string  – UUID of the stored prediction
 *   disease_name   string  – e.g. "Yellow Rust"
 *   confidence_pct number  – 0–100
 *   severity       string  – "high" | "critical" | "moderate" | ...
 *   risk_level     string  – e.g. "High"
 *   recommendation string  – actionable text
 *   image_url      string? – public URL of the leaf image
 *
 * Response:
 *   { success, queued, sent, reason? }
 *
 *   sent=true only once Gmail has actually accepted the message, so the
 *   FastAPI caller can tell the farmer the truth about delivery.
 */
router.post("/disease-alert", async (req, res) => {
  try {
    const {
      user_id,
      user_email,
      user_name = "",
      prediction_id,
      disease_name,
      confidence_pct,
      severity,
      risk_level,
      recommendation = "",
      image_url = null,
    } = req.body;

    if (!user_id || !user_email || !disease_name || confidence_pct == null) {
      return res.status(400).json({
        success: false,
        message: "user_id, user_email, disease_name, and confidence_pct are required.",
      });
    }

    const result = await sendHighRiskAlert({
      userId:        user_id,
      userEmail:     user_email,
      userName:      user_name,
      predictionId:  prediction_id,
      diseaseName:   disease_name,
      confidencePct: confidence_pct,
      severity,
      riskLevel:     risk_level,
      recommendation,
      imageUrl:      image_url,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("POST /internal/disease-alert error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to process alert." });
  }
});

// ── POST /api/internal/reminder-alert ────────────────────────────────────────

/**
 * Deliver a due calendar reminder (in-app bell row + optional email).
 *
 * Body:
 *   user_id       string  – Supabase auth UUID of the user
 *   user_email    string? – recipient email (may be empty if in-app only)
 *   user_name     string? – display name
 *   reminder_id   string  – UUID of the calendar reminder
 *   title         string  – reminder title
 *   note          string? – reminder description
 *   category      string? – scan|disease|weather|farm|general
 *   priority      string? – low|medium|high
 *   due_date      string? – human-readable scheduled date/time
 *   notify_email  boolean? – send the email too (default true)
 *
 * The Python backend owns idempotency (the reminder's notified_at stamp), so
 * this endpoint always delivers on the first call and simply reflects result.
 */
router.post("/reminder-alert", async (req, res) => {
  try {
    const {
      user_id,
      user_email = "",
      user_name = "",
      reminder_id,
      title,
      note = "",
      category = "general",
      priority = "medium",
      due_date = "",
      notify_email = true,
    } = req.body;

    if (!user_id || !reminder_id || !title) {
      return res.status(400).json({
        success: false,
        message: "user_id, reminder_id, and title are required.",
      });
    }

    const result = await sendReminderAlert({
      userId:     user_id,
      userEmail:  user_email,
      userName:   user_name,
      reminderId: reminder_id,
      title,
      note,
      category,
      priority,
      dueDate:    due_date,
      sendEmail:  notify_email !== false,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("POST /internal/reminder-alert error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to process reminder." });
  }
});

// ── POST /api/internal/change-password ───────────────────────────────────────

/**
 * Change an account's password. Called by the FastAPI backend (which has
 * already validated the user's JWT) with the shared internal secret.
 * The auth service still verifies the CURRENT password before applying the
 * new one. Body: { user_id, current_password, new_password }.
 */
router.post("/change-password", changePassword);

// ── POST /api/internal/change-email ──────────────────────────────────────────
// Change an account's sign-in email (verifies the CURRENT password first).
// Body: { user_id, current_password, new_email }.
router.post("/change-email", changeEmail);

// ── POST /api/internal/delete-account ────────────────────────────────────────
// Remove the Supabase Auth user (verifies the CURRENT password first). The
// FastAPI caller cascades the app rows/storage afterwards.
// Body: { user_id, password }.
router.post("/delete-account", deleteAccount);

export default router;
