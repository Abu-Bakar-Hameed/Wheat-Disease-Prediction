/**
 * WheatGuard AI – Feedback Management Service
 *
 * Server-side logic for the user<->admin feedback system:
 *   - one-shot user submissions (rating + type + message)
 *   - an optional admin<->user reply thread (feedback_messages)
 *   - private internal admin notes (feedback_notes)
 *   - triage (status / priority / assignment), analytics & settings
 *   - automatic feedback-prompt eligibility driven by login count
 *
 * SECURITY RULES (spec §23):
 *   - `userId` / `adminId` are ALWAYS taken from a verified JWT (`req.user.sub`).
 *   - Every user-facing read/write is scoped `.eq("user_id", userId)`.
 *   - Internal admin notes (feedback_notes) are NEVER returned by a user method.
 *   - The DB (profiles) — not the browser — is the source of truth for login
 *     count and prompt history, so email + Google/Microsoft share one counter.
 *
 * Uses supabaseAdmin so RLS never blocks server-side writes.
 */

import { supabaseAdmin } from "../config/supabase.js";
import { createNotification, createBulkNotifications } from "./notification.service.js";
import redis from "../config/redis.js";

const F_TABLE = "feedback";
const M_TABLE = "feedback_messages";
const N_TABLE = "feedback_notes";
const S_TABLE = "feedback_settings";

export const FEEDBACK_TYPES = [
  "General Feedback",
  "Bug Report",
  "Feature Request",
  "UI/UX",
  "Performance",
  "Chatbot Experience",
  "Other",
];
export const FEEDBACK_STATUSES = [
  "new", "under_review", "in_progress", "resolved", "closed",
];
export const FEEDBACK_PRIORITIES = ["low", "medium", "high", "critical"];

// Error carrying an HTTP status the route layer honours.
class FeedbackError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const snippet = (text, n = 140) =>
  text && text.length > n ? `${text.slice(0, n - 1)}…` : text;

const trim = (v) => (typeof v === "string" ? v.trim() : "");

async function getProfile(userId) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, role")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

async function listAdminIds() {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  return (data || []).map((r) => r.id);
}

// Human friendly "FB-#####" code, unique. Retries on collision.
async function generateTicket() {
  for (let i = 0; i < 8; i++) {
    const ticket = `FB-${10000 + Math.floor(Math.random() * 90000)}`;
    const { count } = await supabaseAdmin
      .from(F_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("ticket", ticket);
    if ((count ?? 0) === 0) return ticket;
  }
  return `FB-${Date.now().toString().slice(-7)}`;
}

// Reply count + unread-for-user per feedback (single round trip).
async function replySummaryFor(ids) {
  const result = {};
  if (!ids.length) return result;
  const { data } = await supabaseAdmin
    .from(M_TABLE)
    .select("feedback_id, sender_type, user_read")
    .in("feedback_id", ids);
  for (const m of data || []) {
    const r = (result[m.feedback_id] ??= { replies: 0, unread: 0 });
    r.replies += 1;
    if (m.sender_type === "admin" && m.user_read === false) r.unread += 1;
  }
  return result;
}

async function invalidateFeedbackUnread(userId) {
  try { await redis.del(`feedback_unread:${userId}`); } catch { /* Redis optional */ }
}

// ── Settings ────────────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS = {
  first_prompt_login: 2, // never on login #1; auto-show from the 2nd login onward
  prompt_interval: 3,
  cooldown_days: 30,
  require_rating: false,
  enabled: true,
};

export async function getSettings() {
  const { data } = await supabaseAdmin
    .from(S_TABLE)
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  return { ...SETTINGS_DEFAULTS, ...(data || {}) };
}

export async function updateSettings(patch = {}) {
  const update = {};
  const intFields = ["first_prompt_login", "prompt_interval", "cooldown_days"];
  const boolFields = ["require_rating", "enabled"];
  for (const f of intFields) {
    if (patch[f] !== undefined) {
      const n = parseInt(patch[f], 10);
      if (Number.isNaN(n) || n < 0) throw new FeedbackError(`Invalid ${f}.`);
      update[f] = n;
    }
  }
  for (const f of boolFields) {
    if (patch[f] !== undefined) update[f] = !!patch[f];
  }
  if (!Object.keys(update).length) return getSettings();

  const { data, error } = await supabaseAdmin
    .from(S_TABLE)
    .update(update)
    .eq("id", "default")
    .select()
    .single();
  if (error) throw new FeedbackError(error.message, 500);
  return { ...SETTINGS_DEFAULTS, ...data };
}

// ── Login tracking + prompt eligibility (spec §8/§19/§20) ────────────────────

/**
 * Record a successful login and decide whether the automatic feedback popup
 * should be shown. Increments login_count, stamps last_login_at, and — when
 * eligible — records the prompt so repeat prompts are spaced by both login
 * count (prompt_interval) and wall-clock time (cooldown_days).
 *
 * Called identically from email/password login AND the OAuth token issuer, so
 * a user's counter is shared regardless of provider.
 *
 * @returns {Promise<{ showFeedback: boolean, loginCount: number }>}
 */
export async function registerLoginAndCheckPrompt(userId) {
  if (!userId) return { showFeedback: false, loginCount: 0 };

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select(
      "login_count, feedback_prompt_count, last_feedback_prompt_at, " +
      "last_feedback_submitted_at, feedback_last_prompt_login"
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("registerLogin profile read failed:", error.message);
    return { showFeedback: false, loginCount: 0 };
  }
  if (!profile) return { showFeedback: false, loginCount: 0 };

  const settings = await getSettings();
  const loginCount = (profile.login_count ?? 0) + 1;
  const now = new Date();

  let showFeedback = false;
  if (settings.enabled) {
    const lastPromptLogin = profile.feedback_last_prompt_login ?? 0;
    const firstPrompt = Math.max(2, settings.first_prompt_login || 2);

    // Login-count gate: first at `first_prompt_login`, then every interval.
    let eligibleByLogin;
    if (lastPromptLogin === 0) {
      eligibleByLogin = loginCount >= firstPrompt;
    } else {
      const nextAt = lastPromptLogin + Math.max(1, settings.prompt_interval || 1);
      eligibleByLogin = loginCount >= nextAt;
    }

    // Time gate: cooldown measured from the later of last prompt / last submit.
    const baseTs =
      [profile.last_feedback_prompt_at, profile.last_feedback_submitted_at]
        .filter(Boolean)
        .map((t) => new Date(t).getTime())
        .sort((a, b) => b - a)[0] ?? null;
    const cooldownMs = Math.max(0, settings.cooldown_days || 0) * 86_400_000;
    const eligibleByTime = baseTs === null || now.getTime() - baseTs >= cooldownMs;

    showFeedback = eligibleByLogin && eligibleByTime;
  }

  const update = { login_count: loginCount, last_login_at: now.toISOString() };
  if (showFeedback) {
    update.feedback_prompt_count = (profile.feedback_prompt_count ?? 0) + 1;
    update.last_feedback_prompt_at = now.toISOString();
    update.feedback_last_prompt_login = loginCount;
  }

  const { error: uErr } = await supabaseAdmin
    .from("profiles")
    .update(update)
    .eq("id", userId);
  if (uErr) console.error("registerLogin profile update failed:", uErr.message);

  return { showFeedback, loginCount };
}

/**
 * Called when a user actually submits feedback — records the time so the
 * cooldown clock restarts and the popup does not immediately reappear.
 */
export async function markFeedbackSubmitted(userId) {
  if (!userId) return;
  try {
    await supabaseAdmin
      .from("profiles")
      .update({ last_feedback_submitted_at: new Date().toISOString() })
      .eq("id", userId);
  } catch (e) {
    console.error("markFeedbackSubmitted failed:", e.message);
  }
}

// ── User: create feedback ─────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {string} p.userId         JWT sub (canonical identity)
 * @param {string} p.message        feedback body (required)
 * @param {string} [p.type]         validated against FEEDBACK_TYPES
 * @param {number|null} [p.rating]  1..5, optional unless require_rating
 * @param {string} [p.category]
 * @param {string} [p.authProvider] email/google/microsoft snapshot
 * Chatbot context (only when feedback relates to a chatbot answer):
 * @param {string} [p.conversationId]
 * @param {string} [p.messageId]
 * @param {string} [p.provider]
 * @param {string} [p.model]
 */
export async function createFeedback(p) {
  const { userId, message, type, rating, category, authProvider,
    conversationId, messageId, provider, model } = p;

  const msg = trim(message);
  if (msg.length < 3 || msg.length > 5000) {
    throw new FeedbackError("Feedback must be between 3 and 5000 characters.");
  }

  let fType = trim(type) || "General Feedback";
  if (!FEEDBACK_TYPES.includes(fType)) fType = "Other";

  const settings = await getSettings();
  let rNum = null;
  if (rating !== undefined && rating !== null && rating !== "") {
    rNum = parseInt(rating, 10);
    if (Number.isNaN(rNum) || rNum < 1 || rNum > 5) {
      throw new FeedbackError("Rating must be between 1 and 5.");
    }
  }
  if (settings.require_rating && rNum === null) {
    throw new FeedbackError("A rating is required.");
  }

  const profile = await getProfile(userId);
  if (!profile) throw new FeedbackError("Profile not found for this account.", 403);

  const ticket = await generateTicket();
  const { data: feedback, error } = await supabaseAdmin
    .from(F_TABLE)
    .insert({
      ticket,
      user_id: userId,
      type: fType,
      category: trim(category) || null,
      rating: rNum,
      message: msg,
      status: "new",
      priority: rNum !== null && rNum <= 2 ? "high" : "medium",
      conversation_id: trim(conversationId) || null,
      message_id: trim(messageId) || null,
      provider: trim(provider) || null,
      model: trim(model) || null,
      user_name: profile.name || "",
      user_email: profile.email || "",
      auth_provider: authProvider || "email",
    })
    .select()
    .single();
  if (error) throw new FeedbackError(error.message, 500);

  // Feedback submitted -> restart the cooldown timer (never auto-prompt again
  // immediately).
  await markFeedbackSubmitted(userId);

  // Notify every admin (in-app). Best-effort.
  try {
    const adminIds = await listAdminIds();
    if (adminIds.length) {
      await createBulkNotifications(
        adminIds.map((id) => ({ userId: id })),
        {
          title: `New feedback ${ticket} from ${profile.name || profile.email}`,
          message: `${fType}${rNum ? ` · ${rNum}★` : ""} — ${snippet(msg, 90)}`,
          type: "admin_message",
          category: "admin",
          priority: "normal",
          actionUrl: "/admin/feedback",
          createdBy: userId,
          sendEmail: false,
        }
      );
    }
  } catch (e) {
    console.error("createFeedback admin notify failed:", e.message);
  }

  return feedback;
}

// ── User: list own feedback ───────────────────────────────────────────────────

export async function listUserFeedback(userId) {
  const { data: items, error } = await supabaseAdmin
    .from(F_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new FeedbackError(error.message, 500);

  const ids = (items || []).map((f) => f.id);
  const tally = await replySummaryFor(ids);
  return (items || []).map((f) => ({
    ...f,
    reply_count: tally[f.id]?.replies ?? 0,
    unread_replies: tally[f.id]?.unread ?? 0,
  }));
}

// ── User: unread admin-reply count (badge) ────────────────────────────────────

export async function getUserUnreadCount(userId) {
  try {
    const cached = await redis.get(`feedback_unread:${userId}`);
    if (cached !== null) return parseInt(cached, 10);
  } catch { /* Redis optional */ }

  const { data: items } = await supabaseAdmin
    .from(F_TABLE).select("id").eq("user_id", userId);
  const ids = (items || []).map((f) => f.id);
  let count = 0;
  if (ids.length) {
    const { count: c } = await supabaseAdmin
      .from(M_TABLE)
      .select("id", { count: "exact", head: true })
      .in("feedback_id", ids)
      .eq("sender_type", "admin")
      .eq("user_read", false);
    count = c ?? 0;
  }
  try { await redis.set(`feedback_unread:${userId}`, String(count), { EX: 60 }); } catch { /* optional */ }
  return count;
}

// ── User: get one feedback + admin replies (NOT internal notes) ───────────────

export async function getUserFeedback(userId, feedbackId) {
  const { data: feedback, error } = await supabaseAdmin
    .from(F_TABLE)
    .select("*")
    .eq("id", feedbackId)
    .eq("user_id", userId) // ownership enforced
    .maybeSingle();
  if (error) throw new FeedbackError(error.message, 500);
  if (!feedback) throw new FeedbackError("Feedback not found.", 404);

  const { data: messages, error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .select("id, feedback_id, sender_id, sender_type, message, user_read, created_at")
    .eq("feedback_id", feedbackId)
    .order("created_at", { ascending: true });
  if (mErr) throw new FeedbackError(mErr.message, 500);

  // Opening clears the unread badge.
  await supabaseAdmin
    .from(M_TABLE)
    .update({ user_read: true })
    .eq("feedback_id", feedbackId)
    .eq("sender_type", "admin")
    .eq("user_read", false);
  await invalidateFeedbackUnread(userId);

  return { feedback, messages: messages ?? [] };
}

// ── User: optional follow-up reply on their own feedback ──────────────────────

export async function addUserReply(userId, feedbackId, message) {
  const msg = trim(message);
  if (!msg || msg.length > 5000) {
    throw new FeedbackError("Message is required (max 5000 characters).");
  }
  const { data: feedback, error } = await supabaseAdmin
    .from(F_TABLE)
    .select("id, ticket")
    .eq("id", feedbackId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new FeedbackError(error.message, 500);
  if (!feedback) throw new FeedbackError("Feedback not found.", 404);

  const { data: row, error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .insert({
      feedback_id: feedbackId,
      sender_id: userId,
      sender_type: "user",
      message: msg,
      user_read: true,
    })
    .select()
    .single();
  if (mErr) throw new FeedbackError(mErr.message, 500);

  try {
    const targets = (await listAdminIds()).map((id) => ({ userId: id }));
    if (targets.length) {
      await createBulkNotifications(targets, {
        title: `New reply on feedback ${feedback.ticket}`,
        message: snippet(msg),
        type: "admin_message",
        category: "admin",
        priority: "normal",
        actionUrl: "/admin/feedback",
        createdBy: userId,
        sendEmail: false,
      });
    }
  } catch (e) {
    console.error("addUserReply admin notify failed:", e.message);
  }
  return row;
}

// ── Admin: list (summary, paginated, filtered, searched) ─────────────────────

export async function adminListFeedback({
  search = "", type = null, status = null, priority = null, rating = null,
  assignedAdmin = null, from = null, to = null,
  sort = "created_at", page = 1, limit = 20,
} = {}) {
  const offset = (Math.max(1, page) - 1) * limit;
  const allowedSort = ["created_at", "updated_at", "priority", "status", "rating"];
  const orderCol = allowedSort.includes(sort) ? sort : "created_at";

  let query = supabaseAdmin.from(F_TABLE).select("*", { count: "exact" });

  if (type)          query = query.eq("type", type);
  if (status)        query = query.eq("status", status);
  if (priority)      query = query.eq("priority", priority);
  if (rating)        query = query.eq("rating", parseInt(rating, 10));
  if (assignedAdmin) query = query.eq("assigned_admin_id", assignedAdmin);
  if (from)          query = query.gte("created_at", from);
  if (to)            query = query.lte("created_at", to);

  const s = trim(search);
  if (s) {
    const like = `%${s}%`;
    query = query.or(
      `ticket.ilike.${like},message.ilike.${like},user_name.ilike.${like},user_email.ilike.${like}`
    );
  }

  query = query.order(orderCol, { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new FeedbackError(error.message, 500);

  const ids = (data || []).map((f) => f.id);
  const tally = await replySummaryFor(ids);
  const feedback = (data || []).map((f) => ({
    ...f,
    reply_count: tally[f.id]?.replies ?? 0,
  }));

  return {
    feedback,
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit) || 1,
  };
}

// ── Admin: detail (replies + internal notes) ─────────────────────────────────

export async function adminGetFeedbackDetail(feedbackId) {
  const { data: feedback, error } = await supabaseAdmin
    .from(F_TABLE)
    .select("*")
    .eq("id", feedbackId)
    .maybeSingle();
  if (error) throw new FeedbackError(error.message, 500);
  if (!feedback) throw new FeedbackError("Feedback not found.", 404);

  const { data: messages } = await supabaseAdmin
    .from(M_TABLE)
    .select("*")
    .eq("feedback_id", feedbackId)
    .order("created_at", { ascending: true });

  const { data: notes } = await supabaseAdmin
    .from(N_TABLE)
    .select("*")
    .eq("feedback_id", feedbackId)
    .order("created_at", { ascending: true });

  // Enrich notes with author names.
  const authorIds = [...new Set((notes || []).map((n) => n.admin_id))];
  const nameById = {};
  if (authorIds.length) {
    const { data: admins } = await supabaseAdmin
      .from("profiles").select("id, name, email").in("id", authorIds);
    for (const a of admins || []) nameById[a.id] = a.name || a.email;
  }
  const enrichedNotes = (notes || []).map((n) => ({
    ...n,
    admin_name: nameById[n.admin_id] || "Admin",
  }));

  return { feedback, messages: messages ?? [], notes: enrichedNotes };
}

// ── Admin: reply to user (visible) ───────────────────────────────────────────

export async function adminReply(adminId, feedbackId, message) {
  const msg = trim(message);
  if (!msg) throw new FeedbackError("Reply message is required.");
  if (msg.length > 5000) throw new FeedbackError("Reply is too long (max 5000 characters).");

  const { data: feedback, error } = await supabaseAdmin
    .from(F_TABLE).select("*").eq("id", feedbackId).maybeSingle();
  if (error) throw new FeedbackError(error.message, 500);
  if (!feedback) throw new FeedbackError("Feedback not found.", 404);

  const { data: row, error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .insert({
      feedback_id: feedbackId,
      sender_id: adminId,
      sender_type: "admin",
      message: msg,
      user_read: false,
    })
    .select()
    .single();
  if (mErr) throw new FeedbackError(mErr.message, 500);

  await invalidateFeedbackUnread(feedback.user_id);

  // Notify the user (in-app + email, respecting preferences).
  try {
    await createNotification({
      userId: feedback.user_id,
      title: `The team replied to your feedback`,
      message: snippet(msg),
      type: "admin_message",
      category: "admin",
      priority: "normal",
      actionUrl: "/dashboard",
      metadata: { ticket: feedback.ticket, feedback_id: feedbackId },
      createdBy: adminId,
      userEmail: feedback.user_email || null,
      userName: feedback.user_name || "",
    });
  } catch (e) {
    console.error("adminReply notify failed:", e.message);
  }
  return row;
}

// ── Admin: internal note (NEVER surfaced to the user) ─────────────────────────

export async function adminAddNote(adminId, feedbackId, note) {
  const text = trim(note);
  if (!text) throw new FeedbackError("Note is required.");
  if (text.length > 5000) throw new FeedbackError("Note is too long (max 5000 characters).");

  const { data: feedback, error } = await supabaseAdmin
    .from(F_TABLE).select("id").eq("id", feedbackId).maybeSingle();
  if (error) throw new FeedbackError(error.message, 500);
  if (!feedback) throw new FeedbackError("Feedback not found.", 404);

  const { data: row, error: nErr } = await supabaseAdmin
    .from(N_TABLE)
    .insert({ feedback_id: feedbackId, admin_id: adminId, note: text })
    .select()
    .single();
  if (nErr) throw new FeedbackError(nErr.message, 500);
  return { ...row, admin_name: (await getProfile(adminId))?.name || "Admin" };
}

// ── Admin: update status / priority / assignment ─────────────────────────────

export async function adminUpdateFeedback(adminId, feedbackId, patch = {}) {
  const update = { updated_by: adminId };

  if (patch.status !== undefined) {
    if (!FEEDBACK_STATUSES.includes(patch.status)) throw new FeedbackError("Invalid status.");
    update.status = patch.status;
    if (patch.status === "resolved") {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = adminId;
    } else {
      update.resolved_at = null;
      update.resolved_by = null;
    }
  }
  if (patch.priority !== undefined) {
    if (!FEEDBACK_PRIORITIES.includes(patch.priority)) throw new FeedbackError("Invalid priority.");
    update.priority = patch.priority;
  }
  if (patch.assigned_admin_id !== undefined) {
    update.assigned_admin_id = patch.assigned_admin_id || null;
  }

  const businessKeys = ["status", "priority", "assigned_admin_id"];
  if (!businessKeys.some((k) => patch[k] !== undefined)) {
    throw new FeedbackError("Nothing to update.");
  }

  const { data: feedback, error } = await supabaseAdmin
    .from(F_TABLE).select("*").eq("id", feedbackId).maybeSingle();
  if (error) throw new FeedbackError(error.message, 500);
  if (!feedback) throw new FeedbackError("Feedback not found.", 404);

  const { data: updated, error: uErr } = await supabaseAdmin
    .from(F_TABLE)
    .update(update)
    .eq("id", feedbackId)
    .select()
    .single();
  if (uErr) throw new FeedbackError(uErr.message, 500);

  // Tell the user when their feedback is resolved.
  if (patch.status === "resolved") {
    try {
      await createNotification({
        userId: feedback.user_id,
        title: `Your feedback ${feedback.ticket} was resolved`,
        message: "Thanks for helping improve WheatGuard AI!",
        type: "admin_message",
        category: "admin",
        priority: "normal",
        actionUrl: "/dashboard",
        metadata: { ticket: feedback.ticket, feedback_id: feedbackId, status: "resolved" },
        createdBy: adminId,
        sendEmail: false,
      });
    } catch (e) {
      console.error("adminUpdateFeedback notify failed:", e.message);
    }
  }
  return updated;
}

// ── Admin: delete ─────────────────────────────────────────────────────────────

export async function adminDeleteFeedback(feedbackId) {
  const { data, error } = await supabaseAdmin
    .from(F_TABLE).select("id").eq("id", feedbackId).maybeSingle();
  if (error) throw new FeedbackError(error.message, 500);
  if (!data) throw new FeedbackError("Feedback not found.", 404);
  const { error: dErr } = await supabaseAdmin.from(F_TABLE).delete().eq("id", feedbackId);
  if (dErr) throw new FeedbackError(dErr.message, 500);
  return { deleted: true };
}

// ── Admin: stats + badge count ────────────────────────────────────────────────

export async function adminStats() {
  const base = () => supabaseAdmin.from(F_TABLE).select("id", { count: "exact", head: true });
  const { count: total } = await base();
  const countStatus = async (s) => (await base().eq("status", s)).count ?? 0;

  const [news, underReview, inProgress, resolved, closed] = await Promise.all([
    countStatus("new"), countStatus("under_review"), countStatus("in_progress"),
    countStatus("resolved"), countStatus("closed"),
  ]);

  // Average rating (ignore nulls).
  const { data: rated } = await supabaseAdmin
    .from(F_TABLE).select("rating").not("rating", "is", "null");
  const ratings = (rated || []).map((r) => r.rating);
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : 0;

  return {
    total: total ?? 0,
    new: news,
    under_review: underReview,
    in_progress: inProgress,
    resolved,
    closed,
    avg_rating: avgRating,
    rated_count: ratings.length,
  };
}

export async function adminNewCount() {
  const { count } = await supabaseAdmin
    .from(F_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return count ?? 0;
}

export async function listAssignableAdmins() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email")
    .eq("role", "admin")
    .order("name", { ascending: true });
  if (error) throw new FeedbackError(error.message, 500);
  return data ?? [];
}

// ── Analytics (spec §16) ──────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {number} [p.days]      7 | 30 | 90 | 365 (default 30)
 * @param {string} [p.from]      custom start (ISO); overrides days when both given
 * @param {string} [p.to]        custom end (ISO)
 */
export async function analytics({ days = 30, from = null, to = null } = {}) {
  let query = supabaseAdmin
    .from(F_TABLE)
    .select("rating, type, status, provider, model, created_at");
  if (from) query = query.gte("created_at", from);
  else {
    const start = new Date(Date.now() - Math.max(1, days) * 86_400_000).toISOString();
    query = query.gte("created_at", start);
  }
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) throw new FeedbackError(error.message, 500);
  const rows = data || [];

  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byType = {};
  const byProvider = {};
  const byModel = {};
  const trendMap = {};

  for (const r of rows) {
    if (r.rating >= 1 && r.rating <= 5) ratingDistribution[r.rating] += 1;
    byType[r.type] = (byType[r.type] || 0) + 1;
    if (r.provider) byProvider[r.provider] = (byProvider[r.provider] || 0) + 1;
    if (r.model) byModel[r.model] = (byModel[r.model] || 0) + 1;

    const key = (r.created_at || "").slice(0, 10); // YYYY-MM-DD
    if (key) trendMap[key] = (trendMap[key] || 0) + 1;
  }

  const trend = Object.entries(trendMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const asSorted = (obj) =>
    Object.entries(obj).map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  return {
    total: rows.length,
    rating_distribution: ratingDistribution,
    by_type: asSorted(byType),
    by_provider: asSorted(byProvider),
    by_model: asSorted(byModel),
    trend,
  };
}
