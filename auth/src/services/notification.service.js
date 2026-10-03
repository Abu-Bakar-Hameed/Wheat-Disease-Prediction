/**
 * WheatGuard AI – Notification Service
 *
 * Central service for creating, reading, and managing notifications.
 * Uses supabaseAdmin so RLS never blocks server-side writes.
 * Redis is used only for the unread-count cache — it degrades
 * gracefully if Redis is unavailable.
 *
 * Never derive user_id from the frontend — always pass it from
 * a verified JWT payload.
 */

import { supabaseAdmin } from "../config/supabase.js";
import redis from "../config/redis.js";
import { sendNotificationEmail, sendDiseaseAlertEmail, sendWeeklyDigestEmail, sendReminderEmail } from "./email.service.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const TABLE = "notifications";
const PREFS_TABLE = "notification_preferences";
const UNREAD_CACHE_TTL = 60; // seconds

// Category → type mapping used for preference gating
const TYPE_PREF_MAP = {
  login:              { inApp: "login_alerts",    email: "email_login"    },
  failed_login:       { inApp: "security_alerts", email: "email_security" },
  signup:             { inApp: "account_alerts",  email: "email_account"  },
  email_verification: { inApp: "account_alerts",  email: "email_account"  },
  password_changed:   { inApp: "password_alerts", email: "email_password" },
  password_reset:     { inApp: "password_alerts", email: "email_password" },
  profile_updated:    { inApp: "account_alerts",  email: "email_account"  },
  account_suspended:  { inApp: "account_alerts",  email: "email_account"  },
  account_activated:  { inApp: "account_alerts",  email: "email_account"  },
  security_alert:     { inApp: "security_alerts", email: "email_security" },
  admin_message:      { inApp: "admin_alerts",    email: "email_admin"    },
  system:             { inApp: "system_alerts",   email: "email_system"   },
  announcement:       { inApp: "system_alerts",   email: "email_system"   },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function unreadKey(userId) {
  return `notif_unread:${userId}`;
}

async function invalidateUnreadCache(userId) {
  try { await redis.del(unreadKey(userId)); } catch { /* Redis optional */ }
}

async function getPreferences(userId) {
  const defaults = {
    login_alerts: true, security_alerts: true, password_alerts: true,
    account_alerts: true, system_alerts: true, admin_alerts: true,
    email_enabled: true, email_login: true, email_security: true,
    email_password: true, email_account: true,
    email_system: false, email_admin: true, email_support: true,
  };
  try {
    const { data } = await supabaseAdmin
      .from(PREFS_TABLE)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return defaults;

    // Strip NULL/undefined columns so they don't override the defaults,
    // and ignore non-preference columns (id, user_id, timestamps).
    const clean = {};
    for (const key of Object.keys(defaults)) {
      if (typeof data[key] === "boolean") clean[key] = data[key];
    }
    return { ...defaults, ...clean };
  } catch {
    return defaults;
  }
}

// ── Core: createNotification ──────────────────────────────────────────────────

/**
 * Create a single notification.
 *
 * @param {object} params
 * @param {string} params.userId       - Recipient's Supabase Auth UUID
 * @param {string} params.title
 * @param {string} [params.message]
 * @param {string} [params.type]       - see CHECK constraint in schema
 * @param {string} [params.category]   - security|account|system|admin|general
 * @param {string} [params.priority]   - low|normal|high|critical
 * @param {string|null} [params.actionUrl]
 * @param {object} [params.metadata]
 * @param {string|null} [params.createdBy]  - admin UUID or null for system
 * @param {boolean} [params.sendEmail]      - override: force/suppress email
 * @param {string|null} [params.userEmail]  - needed when sendEmail is true
 * @param {string} [params.userName]
 * @returns {Promise<object|null>} created row or null on failure
 */
export async function createNotification({
  userId,
  title,
  message = "",
  type = "system",
  category = "general",
  priority = "normal",
  actionUrl = null,
  metadata = {},
  createdBy = null,
  sendEmail,          // undefined = respect preferences
  userEmail = null,
  userName = "",
  inApp = true,       // false = never write a bell row (email-only events)
}) {
  if (!userId || !title) return null;

  const prefs = await getPreferences(userId);
  const prefKey = TYPE_PREF_MAP[type] ?? { inApp: "system_alerts", email: "email_system" };

  // Gate the in-app bell row on the explicit flag AND the user's preference.
  const inAppAllowed = inApp !== false && prefs[prefKey.inApp] !== false;

  let row = null;
  if (inAppAllowed) {
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({
          user_id:    userId,
          title,
          message,
          type,
          category,
          priority,
          action_url: actionUrl,
          metadata,
          created_by: createdBy,
        })
        .select()
        .single();

      if (error) { console.error("notification insert error:", error.message); return null; }
      row = data;
      await invalidateUnreadCache(userId);
    } catch (err) {
      console.error("createNotification error:", err.message);
      return null;
    }
  }

  // Email: respect preference unless explicitly overridden. Runs even when the
  // bell row was suppressed, so security login emails still reach the user.
  const emailEnabled = sendEmail !== undefined
    ? sendEmail
    : prefs.email_enabled && prefs[prefKey.email] !== false;

  if (emailEnabled && userEmail) {
    sendNotificationEmailAsync({
      to: userEmail, name: userName, title, message,
      category, priority, actionUrl,
      notificationId: row?.id,
      userId,
    });
  }

  return row;
}

// ── Bulk create ───────────────────────────────────────────────────────────────

/**
 * Create the same notification for multiple users.
 * Inserts in a single batch; fires emails in background.
 *
 * @param {Array<{userId, userEmail?, userName?}>} recipients
 * @param {object} payload  - title, message, type, category, priority, ...
 * @returns {Promise<number>} number of rows inserted
 */
export async function createBulkNotifications(recipients, payload) {
  if (!recipients?.length) return 0;

  const {
    title, message = "", type = "system", category = "general",
    priority = "normal", actionUrl = null, metadata = {}, createdBy = null,
    sendEmail: forceEmail,
  } = payload;

  // Build one row per recipient (no preference check in bulk — admin broadcast)
  const rows = recipients.map(({ userId }) => ({
    user_id: userId, title, message, type, category, priority,
    action_url: actionUrl, metadata, created_by: createdBy,
  }));

  let inserted = 0;
  const insertedIdByUser = new Map();
  try {
    const { data, error } = await supabaseAdmin.from(TABLE).insert(rows).select("id,user_id");
    if (error) { console.error("bulk insert error:", error.message); return 0; }
    inserted = data?.length ?? 0;
    (data || []).forEach(r => { insertedIdByUser.set(r.user_id, r.id); });
    // Invalidate unread caches
    const unique = [...new Set(recipients.map(r => r.userId))];
    await Promise.allSettled(unique.map(id => invalidateUnreadCache(id)));
  } catch (err) {
    console.error("createBulkNotifications error:", err.message);
    return 0;
  }

  // Send emails in background (only when the caller explicitly asked)
  if (forceEmail === true) {
    recipients.forEach(({ userId, userEmail, userName = "" }) => {
      if (userEmail) {
        sendNotificationEmailAsync({
          to: userEmail, name: userName, title, message,
          category, priority, actionUrl,
          notificationId: insertedIdByUser.get(userId),
        });
      }
    });
  }

  return inserted;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * List notifications for a user with pagination and filters.
 */
export async function getNotifications({
  userId,
  page = 1,
  limit = 20,
  unreadOnly = false,
  category = null,
  type = null,
}) {
  const offset = (Math.max(1, page) - 1) * limit;
  let query = supabaseAdmin
    .from(TABLE)
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) query = query.eq("is_read", false);
  if (category)   query = query.eq("category", category);
  if (type)       query = query.eq("type", type);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { notifications: data ?? [], total: count ?? 0, page, limit };
}

/**
 * Get unread count (Redis-cached, 60 s).
 */
export async function getUnreadCount(userId) {
  const key = unreadKey(userId);
  try {
    const cached = await redis.get(key);
    if (cached !== null) return parseInt(cached, 10);
  } catch { /* Redis optional */ }

  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) return 0;
  const n = count ?? 0;
  try { await redis.set(key, String(n), { EX: UNREAD_CACHE_TTL }); } catch { /* optional */ }
  return n;
}

// ── Mark read ─────────────────────────────────────────────────────────────────

export async function markAsRead(notificationId, userId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)       // ownership check
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  await invalidateUnreadCache(userId);
  return data;
}

export async function markAllAsRead(userId) {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw new Error(error.message);
  await invalidateUnreadCache(userId);
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteNotification(notificationId, userId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq("id", notificationId)
    .eq("user_id", userId)       // ownership check
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return false;
  await invalidateUnreadCache(userId);
  return true;
}

export async function clearAllNotifications(userId) {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  await invalidateUnreadCache(userId);
}

// ── Preferences ───────────────────────────────────────────────────────────────

export async function getNotificationPreferences(userId) {
  return getPreferences(userId);
}

export async function saveNotificationPreferences(userId, prefs) {
  const { data, error } = await supabaseAdmin
    .from(PREFS_TABLE)
    .upsert({ user_id: userId, ...prefs }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

export async function adminGetNotifications({ page = 1, limit = 20, search = "", category = null }) {
  const offset = (Math.max(1, page) - 1) * limit;
  let query = supabaseAdmin
    .from(TABLE)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search)   query = query.ilike("title", `%${search}%`);
  if (category) query = query.eq("category", category);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { notifications: data ?? [], total: count ?? 0, page, limit };
}

export async function adminDeleteNotification(notificationId) {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq("id", notificationId);
  if (error) throw new Error(error.message);
}

export async function adminGetStats() {
  const { count: total }    = await supabaseAdmin.from(TABLE).select("id", { count: "exact", head: true });
  const { count: unread }   = await supabaseAdmin.from(TABLE).select("id", { count: "exact", head: true }).eq("is_read", false);
  const { count: security } = await supabaseAdmin.from(TABLE).select("id", { count: "exact", head: true }).eq("category", "security");
  const { count: system }   = await supabaseAdmin.from(TABLE).select("id", { count: "exact", head: true }).eq("category", "system");
  const { count: emailSent} = await supabaseAdmin.from(TABLE).select("id", { count: "exact", head: true }).eq("email_sent", true);

  // Today's notifications
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { count: today_count } = await supabaseAdmin
    .from(TABLE).select("id", { count: "exact", head: true })
    .gte("created_at", today.toISOString());

  return {
    total: total ?? 0,
    unread: unread ?? 0,
    today: today_count ?? 0,
    email_sent: emailSent ?? 0,
    security: security ?? 0,
    system: system ?? 0,
  };
}

// ── Email fire-and-forget ─────────────────────────────────────────────────────

function sendNotificationEmailAsync(opts) {
  const { notificationId, ...mailOpts } = opts;

  sendNotificationEmail(mailOpts)
    .then(() => markEmailSent(notificationId))
    .catch(err =>
      console.error("❌ Notification email failed:", err.message)
    );
}

/**
 * Flag a notification row as emailed. adminGetStats() counts this
 * column, so without it the "email_sent" stat is always 0.
 */
async function markEmailSent(notificationId) {
  if (!notificationId) return;
  try {
    await supabaseAdmin
      .from(TABLE)
      .update({ email_sent: true, email_sent_at: new Date().toISOString() })
      .eq("id", notificationId);
  } catch (err) {
    console.error("markEmailSent error:", err.message);
  }
}

// ── Disease alert config ──────────────────────────────────────────────────────

const HIGH_RISK_SEVERITIES = new Set(
  (process.env.ALERT_SEVERITIES || "high,critical")
    .split(",")
    .map((s) => s.trim().toLowerCase())
);

const ALERT_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.ALERT_CONFIDENCE_THRESHOLD || "80"
);

const EMAIL_ALERTS_GLOBALLY_ENABLED =
  (process.env.EMAIL_ALERTS_ENABLED ?? "true") !== "false";

const EMAIL_LOG_TABLE = "email_alert_log";

// Total delivery attempts for one disease alert (1 awaited + retries in background).
const maxSendAttempts = 3;

// ── Log email send to Supabase ────────────────────────────────────────────────

async function logEmailAlert({
  recipientEmail,
  userId,
  predictionId,
  alertType = "high_risk",
  status = "sent",
  errorMessage = null,
}) {
  try {
    await supabaseAdmin.from(EMAIL_LOG_TABLE).insert({
      recipient_email: recipientEmail,
      user_id: userId || null,
      prediction_id: predictionId || null,
      alert_type: alertType,
      status,
      error_message: errorMessage || null,
    });
  } catch (err) {
    console.error("logEmailAlert DB error:", err.message);
  }
}

// ── Check if alert already sent for this prediction ───────────────────────────

async function isAlreadyEmailed(predictionId) {
  if (!predictionId) return false;
  try {
    const { count } = await supabaseAdmin
      .from(EMAIL_LOG_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("prediction_id", predictionId)
      .eq("alert_type", "high_risk")
      .eq("status", "sent");
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

// ── Determine if a prediction qualifies for a disease alert email ─────────────

function isHighRiskPrediction({ severity, confidencePct, prediction }) {
  const isHealthy = String(prediction || "").toLowerCase().includes("healthy");
  if (isHealthy) return false;

  const sev = String(severity || "").toLowerCase();
  if (HIGH_RISK_SEVERITIES.has(sev)) return true;

  // An explicit low/medium/moderate/none verdict never alerts, whatever the
  // confidence: the product rule is HIGH or CRITICAL only. Confidence can
  // upgrade a *missing* severity (older callers that have no disease lookup).
  if (!sev && (confidencePct ?? 0) >= ALERT_CONFIDENCE_THRESHOLD) return true;

  return false;
}

/**
 * Send a high-risk disease alert email for a prediction result.
 * Called from the FastAPI side via POST /api/notifications/alert
 * (see admin.notification.routes.js for the endpoint).
 *
 * Guards:
 *  - Global kill switch (EMAIL_ALERTS_ENABLED env var)
 *  - Per-user preference (email_security)
 *  - De-dupe: won't re-send if this prediction_id was already emailed
 *
 * The FIRST delivery attempt is awaited so the FastAPI caller can report
 * truthfully whether the mail went out; retries 2-3 continue in the background.
 * Resolves { queued, sent, reason }.
 *
 * @param {object} params
 * @param {string}  params.userId
 * @param {string}  params.userEmail
 * @param {string}  params.userName
 * @param {string}  params.predictionId
 * @param {string}  params.diseaseName
 * @param {number}  params.confidencePct
 * @param {string}  params.severity
 * @param {string}  params.riskLevel
 * @param {string}  [params.recommendation]
 * @param {string}  [params.imageUrl]
 * @returns {Promise<{queued: boolean, sent: boolean, reason?: string}>}
 */
export async function sendHighRiskAlert({
  userId,
  userEmail,
  userName = "",
  predictionId,
  diseaseName,
  confidencePct,
  severity,
  riskLevel,
  recommendation = "",
  imageUrl = null,
}) {
  // 1. Global kill switch
  if (!EMAIL_ALERTS_GLOBALLY_ENABLED) {
    return { queued: false, reason: "email_alerts_globally_disabled" };
  }

  // 2. Check prediction qualifies
  const prediction = diseaseName;
  if (!isHighRiskPrediction({ severity, confidencePct, prediction })) {
    return { queued: false, reason: "below_threshold" };
  }

  // 3. De-dupe: don't resend for same prediction
  if (predictionId && await isAlreadyEmailed(predictionId)) {
    return { queued: false, reason: "already_sent" };
  }

  // 4. Check user preference
  const prefs = await getPreferences(userId);
  if (!prefs.email_enabled || !prefs.email_security) {
    return { queued: false, reason: "user_preference_disabled" };
  }

  if (!userEmail) {
    return { queued: false, reason: "no_email_address" };
  }

  // 5. First attempt is awaited (see docstring); retries run in background.
  let sent = false;
  let firstError = null;
  try {
    await sendDiseaseAlertEmail({
      to: userEmail,
      name: userName,
      diseaseName,
      confidencePct,
      severity,
      riskLevel,
      recommendation,
      predictionId,
      imageUrl,
    });
    sent = true;
    await logEmailAlert({
      recipientEmail: userEmail,
      userId,
      predictionId,
      alertType: "high_risk",
      status: "sent",
    });
  } catch (err) {
    firstError = err;
    console.error("❌ Disease alert email attempt 1 failed:", err.message);
  }

  // 6. The in-app notification reflects the detection, not the mail delivery,
  //    so it is created either way (best-effort).
  try {
    await createNotification({
      userId,
      title: `High-Risk Alert: ${diseaseName}`,
      message: `${Number(confidencePct ?? 0).toFixed(1)}% confidence — ${severity} severity. ${recommendation}`,
      type: "security_alert",
      category: "security",
      priority: String(severity).toLowerCase() === "critical" ? "critical" : "high",
      actionUrl: predictionId ? `/dashboard/history/${predictionId}` : "/dashboard/history",
      sendEmail: false, // handled above — never send a second mail
      userEmail,
      userName,
    });
  } catch (err) {
    console.error("Disease alert in-app notification failed:", err.message);
  }

  if (!sent) {
    // Keep retrying out-of-band; each successful retry still writes the audit
    // row, which is what stops a later request from double-emailing.
    (async () => {
      let attempt = 1;
      let lastError = firstError;
      while (attempt < maxSendAttempts) {
        attempt++;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        try {
          await sendDiseaseAlertEmail({
            to: userEmail,
            name: userName,
            diseaseName,
            confidencePct,
            severity,
            riskLevel,
            recommendation,
            predictionId,
            imageUrl,
          });
          await logEmailAlert({
            recipientEmail: userEmail,
            userId,
            predictionId,
            alertType: "high_risk",
            status: "sent",
          });
          console.log(`✅ Disease alert email sent on retry ${attempt}`);
          return;
        } catch (err) {
          lastError = err;
          console.error(`❌ Disease alert email retry ${attempt} failed:`, err.message);
        }
      }
      await logEmailAlert({
        recipientEmail: userEmail,
        userId,
        predictionId,
        alertType: "high_risk",
        status: "failed",
        errorMessage: lastError?.message,
      });
    })();
  }

  return {
    queued: true,
    sent,
    reason: sent ? "sent" : "delivery_retrying",
  };
}

/**
 * Deliver a due calendar reminder: always an in-app bell row, plus an email
 * when the caller asked for one and the user's master email switch allows it.
 *
 * Called by the FastAPI reminder scheduler over POST /api/internal/reminder-alert.
 *
 * De-duplication is handled on the Python side via the reminder's `notified_at`
 * column (a reminder is dispatched at most once), so — unlike disease alerts —
 * we do NOT run isAlreadyEmailed() here. The email gate is the global
 * kill-switch plus the user's master email_enabled preference; per-reminder
 * consent is carried by the reminder's own notification_enabled flag, which the
 * backend reflects in the `sendEmail` argument.
 *
 * @returns {Promise<{queued:boolean, sent:boolean, reason:string}>}
 */
export async function sendReminderAlert({
  userId,
  userEmail,
  userName = "",
  reminderId,
  title,
  note = "",
  category = "general",
  priority = "medium",
  dueDate = "",
  sendEmail = true,
}) {
  if (!userId || !title) {
    return { queued: false, sent: false, reason: "missing_user_or_title" };
  }

  // 1. In-app bell row (best-effort). Reflects the reminder regardless of email.
  const notifPriority = String(priority).toLowerCase() === "high" ? "high" : "normal";
  try {
    await createNotification({
      userId,
      title: `Reminder: ${title}`,
      message: `${dueDate ? `${dueDate} — ` : ""}${note || "You have a scheduled reminder."}`,
      type: "system",
      category: "general",
      priority: notifPriority,
      actionUrl: "/dashboard/calendar",
      metadata: { source: "reminder", reminderId: reminderId || null, category },
      sendEmail: false, // we send the reminder-styled mail below, never a generic one
      userEmail,
      userName,
    });
  } catch (err) {
    console.error("Reminder in-app notification failed:", err.message);
  }

  // 2. Email is optional and gated.
  if (!sendEmail) {
    return { queued: true, sent: false, reason: "in_app_only" };
  }
  if (!EMAIL_ALERTS_GLOBALLY_ENABLED) {
    return { queued: true, sent: false, reason: "email_alerts_globally_disabled" };
  }
  if (!userEmail) {
    return { queued: true, sent: false, reason: "no_email_address" };
  }
  const prefs = await getPreferences(userId);
  if (!prefs.email_enabled) {
    return { queued: true, sent: false, reason: "user_preference_disabled" };
  }

  const sendArgs = {
    to: userEmail,
    name: userName,
    title,
    message: note,
    category,
    priority,
    dueDate,
    actionUrl: "/dashboard/calendar",
  };

  // 3. First attempt awaited; retries run in the background (like disease alerts).
  let sent = false;
  let firstError = null;
  try {
    await sendReminderEmail(sendArgs);
    sent = true;
    await logEmailAlert({
      recipientEmail: userEmail,
      userId,
      predictionId: null,
      alertType: "reminder",
      status: "sent",
    });
  } catch (err) {
    firstError = err;
    console.error("❌ Reminder email attempt 1 failed:", err.message);
  }

  if (!sent) {
    (async () => {
      let attempt = 1;
      let lastError = firstError;
      while (attempt < maxSendAttempts) {
        attempt++;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        try {
          await sendReminderEmail(sendArgs);
          await logEmailAlert({
            recipientEmail: userEmail,
            userId,
            predictionId: null,
            alertType: "reminder",
            status: "sent",
          });
          console.log(`✅ Reminder email sent on retry ${attempt}`);
          return;
        } catch (err) {
          lastError = err;
          console.error(`❌ Reminder email retry ${attempt} failed:`, err.message);
        }
      }
      await logEmailAlert({
        recipientEmail: userEmail,
        userId,
        predictionId: null,
        alertType: "reminder",
        status: "failed",
        errorMessage: lastError?.message,
      });
    })();
  }

  return { queued: true, sent, reason: sent ? "sent" : "delivery_retrying" };
}

/**
 * Send weekly digest emails to all opted-in users.
 * Fetches stats from the predictions table for the past 7 days.
 * Designed to be called by the scheduler below.
 */
export async function sendWeeklyDigests() {
  console.log("📧 Starting weekly digest email run…");
  let sent = 0;
  let failed = 0;

  try {
    // Get all users with weekly digest enabled
    const { data: prefsRows, error: prefsErr } = await supabaseAdmin
      .from(PREFS_TABLE)
      .select("user_id")
      .eq("email_system", true)
      .eq("email_enabled", true);

    if (prefsErr || !prefsRows?.length) {
      console.log("📧 No users opted in for weekly digest.");
      return;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const { user_id } of prefsRows) {
      try {
        // Look up profile
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email, name")
          .eq("id", user_id)
          .maybeSingle();

        if (!profile?.email) continue;

        // Fetch this user's 7-day prediction stats
        const { data: preds } = await supabaseAdmin
          .from("predictions")
          .select("predicted_class, confidence, severity")
          .eq("user_id", user_id)
          .gte("created_at", sevenDaysAgo);

        if (!preds?.length) continue;

        const total = preds.length;
        const healthy = preds.filter((p) =>
          p.predicted_class?.toLowerCase().includes("healthy")
        ).length;
        const diseased = total - healthy;
        const critical = preds.filter(
          (p) => p.severity === "critical"
        ).length;
        const avgConf =
          preds.reduce((s, p) => s + (p.confidence || 0), 0) / total;

        const classCounts = {};
        for (const p of preds) {
          classCounts[p.predicted_class] =
            (classCounts[p.predicted_class] ?? 0) + 1;
        }
        const mostCommon = Object.entries(classCounts).sort(
          ([, a], [, b]) => b - a
        )[0]?.[0] ?? null;

        await sendWeeklyDigestEmail({
          to: profile.email,
          name: profile.name,
          stats: {
            total_predictions: total,
            healthy_predictions: healthy,
            diseased_predictions: diseased,
            critical_cases: critical,
            average_confidence: avgConf,
            most_common_disease: mostCommon,
          },
        });

        await logEmailAlert({
          recipientEmail: profile.email,
          userId: user_id,
          predictionId: null,
          alertType: "weekly_digest",
          status: "sent",
        });

        sent++;
      } catch (err) {
        failed++;
        console.error(`❌ Weekly digest failed for user ${user_id}:`, err.message);
        await logEmailAlert({
          recipientEmail: "unknown",
          userId: user_id,
          predictionId: null,
          alertType: "weekly_digest",
          status: "failed",
          errorMessage: err.message,
        });
      }
    }
  } catch (err) {
    console.error("❌ sendWeeklyDigests outer error:", err.message);
  }

  console.log(`📧 Weekly digest run complete — sent: ${sent}, failed: ${failed}`);
}

// ── Weekly digest scheduler ───────────────────────────────────────────────────
// Fires every Sunday at 08:00 server time (adjustable via WEEKLY_DIGEST_CRON).
// Falls back to a simple setInterval if the cron string is unavailable.

(function scheduleWeeklyDigest() {
  const CRON_ENABLED = (process.env.WEEKLY_DIGEST_CRON_ENABLED ?? "true") !== "false";
  if (!CRON_ENABLED) return;

  // setInterval-based scheduler — runs once per week (604800000 ms).
  // On startup, check if today is the configured day-of-week (0 = Sunday).
  const TARGET_DAY = parseInt(process.env.WEEKLY_DIGEST_DAY ?? "0", 10); // 0=Sun
  const TARGET_HOUR = parseInt(process.env.WEEKLY_DIGEST_HOUR ?? "8", 10);

  function msUntilNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(TARGET_HOUR, 0, 0, 0);
    const daysUntil = (TARGET_DAY - now.getDay() + 7) % 7 || 7;
    next.setDate(next.getDate() + daysUntil);
    return next - now;
  }

  function arm() {
    const delay = msUntilNext();
    console.log(
      `📅 Weekly digest scheduled in ${Math.round(delay / 3600000)}h`
    );
    setTimeout(() => {
      sendWeeklyDigests().catch((e) =>
        console.error("Weekly digest error:", e.message)
      );
      setInterval(() => {
        sendWeeklyDigests().catch((e) =>
          console.error("Weekly digest error:", e.message)
        );
      }, 7 * 24 * 60 * 60 * 1000);
    }, delay);
  }

  // Defer until the event loop is free so all imports settle first
  setImmediate(arm);
})();

// ── Email log admin query ─────────────────────────────────────────────────────

export async function getEmailAlertLogs({ page = 1, limit = 20, alertType = null } = {}) {
  const offset = (Math.max(1, page) - 1) * limit;

  let query = supabaseAdmin
    .from(EMAIL_LOG_TABLE)
    .select("*", { count: "exact" })
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (alertType) query = query.eq("alert_type", alertType);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { logs: data ?? [], total: count ?? 0, page, limit };
}
