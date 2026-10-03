/**
 * WheatGuard AI – Query / Support Service
 *
 * Server-side logic for the user<->admin support conversation system.
 *
 * SECURITY RULES (spec §23/§38):
 *   - `userId` / `adminId` are ALWAYS passed in from a verified JWT
 *     (`req.user.sub`). Never read identity from the request body.
 *   - Every user-facing read/write is scoped `.eq("user_id", userId)`.
 *   - Internal admin notes (`is_internal = true`) are never returned in
 *     any user-facing method and never included in emails/notifications.
 *
 * Uses supabaseAdmin so RLS never blocks server-side writes.
 */

import { supabaseAdmin } from "../config/supabase.js";
import { createNotification, createBulkNotifications } from "./notification.service.js";
import { sendSupportReplyEmail, queueEmail } from "./email.service.js";
import redis from "../config/redis.js";

const Q_TABLE = "support_queries";
const M_TABLE = "support_messages";
const PREFS_TABLE = "notification_preferences";

export const QUERY_STATUSES = [
  "new", "open", "waiting_user", "waiting_admin", "resolved", "closed",
];
export const QUERY_PRIORITIES = ["low", "medium", "high", "critical"];

// Errors carrying an HTTP status the route layer should honour.
class SupportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Ticket helper ─────────────────────────────────────────────────────────────
// Human friendly "Q-####" code, unique. Retries on collision.
async function generateTicket() {
  for (let i = 0; i < 8; i++) {
    const ticket = `Q-${1000 + Math.floor(Math.random() * 9000)}`;
    const { count } = await supabaseAdmin
      .from(Q_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("ticket", ticket);
    if ((count ?? 0) === 0) return ticket;
  }
  // Fallback: widen the space so a collision is essentially impossible.
  return `Q-${Date.now().toString().slice(-7)}`;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

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

async function supportEmailEnabled(userId) {
  const { data } = await supabaseAdmin
    .from(PREFS_TABLE)
    .select("email_enabled, email_support")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return true; // default: emails on
  return data.email_enabled !== false && data.email_support !== false;
}

function unreadKey(userId) {
  return `support_unread:${userId}`;
}
async function invalidateSupportUnread(userId) {
  try { await redis.del(unreadKey(userId)); } catch { /* Redis optional */ }
}

const snippet = (text, n = 140) =>
  text.length > n ? `${text.slice(0, n - 1)}…` : text;

const trim = (v) => (typeof v === "string" ? v.trim() : "");

// ── User: create query ────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {string} p.userId   JWT sub (canonical identity)
 * @param {string} p.subject
 * @param {string} p.message
 * @param {string} [p.category]
 * @param {string} [p.provider] auth provider snapshot (from JWT if present)
 */
export async function createQuery({ userId, subject, message, category, provider }) {
  const sub = trim(subject);
  const msg = trim(message);
  if (sub.length < 3 || sub.length > 150) {
    throw new SupportError("Subject must be between 3 and 150 characters.");
  }
  if (msg.length < 10 || msg.length > 5000) {
    throw new SupportError("Message must be between 10 and 5000 characters.");
  }

  const profile = await getProfile(userId);
  if (!profile) throw new SupportError("Profile not found for this account.", 403);

  const ticket = await generateTicket();
  const now = new Date().toISOString();

  const { data: query, error: qErr } = await supabaseAdmin
    .from(Q_TABLE)
    .insert({
      ticket,
      user_id: userId,
      subject: sub,
      category: trim(category) || null,
      status: "new",
      priority: "medium",
      conversation_id: null,
      user_name: profile.name || "",
      user_email: profile.email || "",
      auth_provider: provider || "email",
      last_message_at: now,
    })
    .select()
    .single();
  if (qErr) throw new SupportError(qErr.message, 500);

  const { error: mErr } = await supabaseAdmin.from(M_TABLE).insert({
    query_id: query.id,
    sender_id: userId,
    sender_type: "user",
    message: msg,
    is_internal: false,
    user_read: true,   // the author has obviously read their own message
    admin_read: false,
  });
  if (mErr) throw new SupportError(mErr.message, 500);

  // Notify every admin (in-app; no email to admins). Best-effort.
  try {
    const adminIds = await listAdminIds();
    if (adminIds.length) {
      await createBulkNotifications(
        adminIds.map((id) => ({ userId: id })),
        {
          title: `New query ${ticket} from ${profile.name || profile.email}`,
          message: snippet(sub),
          type: "admin_message",
          category: "admin",
          priority: "normal",
          actionUrl: "/admin/queries",
          createdBy: userId,
          sendEmail: false,
        }
      );
    }
  } catch (e) {
    console.error("createQuery admin notify failed:", e.message);
  }

  return query;
}

// ── User: list own queries ────────────────────────────────────────────────────

export async function listUserQueries(userId) {
  const { data: queries, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false });
  if (error) throw new SupportError(error.message, 500);

  const ids = (queries || []).map((q) => q.id);
  const tally = await messageSummaryFor(ids);

  return (queries || []).map((q) => ({
    ...q,
    message_count: tally[q.id]?.count ?? 0,
    unread_for_user: tally[q.id]?.unread ?? 0,
  }));
}

// Aggregate message count + unread-for-user per query (single round trip).
async function messageSummaryFor(queryIds) {
  const result = {};
  if (!queryIds.length) return result;
  const { data } = await supabaseAdmin
    .from(M_TABLE)
    .select("query_id, sender_type, is_internal, user_read")
    .in("query_id", queryIds);
  for (const m of data || []) {
    const r = (result[m.query_id] ??= { count: 0, unread: 0 });
    if (m.is_internal) continue; // internal notes don't count for the user
    r.count += 1;
    if (m.sender_type === "admin" && m.user_read === false) r.unread += 1;
  }
  return result;
}

// ── User: unread count (badge) ────────────────────────────────────────────────

export async function getUnreadCountForUser(userId) {
  try {
    const cached = await redis.get(unreadKey(userId));
    if (cached !== null) return parseInt(cached, 10);
  } catch { /* Redis optional */ }

  const { data: queries } = await supabaseAdmin
    .from(Q_TABLE)
    .select("id")
    .eq("user_id", userId);
  const ids = (queries || []).map((q) => q.id);
  let count = 0;
  if (ids.length) {
    const { count: c } = await supabaseAdmin
      .from(M_TABLE)
      .select("id", { count: "exact", head: true })
      .in("query_id", ids)
      .eq("sender_type", "admin")
      .eq("is_internal", false)
      .eq("user_read", false);
    count = c ?? 0;
  }
  try { await redis.set(unreadKey(userId), String(count), { EX: 60 }); } catch { /* optional */ }
  return count;
}

// ── User: get one query + thread (marks admin messages read) ───────────────────

export async function getUserQuery(userId, queryId) {
  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("*")
    .eq("id", queryId)
    .eq("user_id", userId) // ownership enforced
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);

  const { data: messages, error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .select("id, query_id, sender_id, sender_type, message, is_internal, user_read, admin_read, created_at")
    .eq("query_id", queryId)
    .eq("is_internal", false) // never expose internal notes to the user
    .order("created_at", { ascending: true });
  if (mErr) throw new SupportError(mErr.message, 500);

  // Opening the thread clears the unread badge for this query.
  await supabaseAdmin
    .from(M_TABLE)
    .update({ user_read: true })
    .eq("query_id", queryId)
    .eq("sender_type", "admin")
    .eq("user_read", false);
  await invalidateSupportUnread(userId);

  return { query, messages: messages ?? [] };
}

// ── User: reply ───────────────────────────────────────────────────────────────

export async function replyAsUser(userId, queryId, message) {
  const msg = trim(message);
  if (msg.length < 1 || msg.length > 5000) {
    throw new SupportError("Message is required (max 5000 characters).");
  }

  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("*")
    .eq("id", queryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);
  if (!["new", "open", "waiting_user"].includes(query.status)) {
    throw new SupportError("This query is not open for replies. Please create a new query or reopen it.", 409);
  }

  const now = new Date().toISOString();
  const { data: row, error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .insert({
      query_id: queryId,
      sender_id: userId,
      sender_type: "user",
      message: msg,
      is_internal: false,
      user_read: true,
      admin_read: false,
    })
    .select()
    .single();
  if (mErr) throw new SupportError(mErr.message, 500);

  const nextStatus = query.status === "waiting_user" ? "open" : query.status;
  await supabaseAdmin
    .from(Q_TABLE)
    .update({ last_message_at: now, status: nextStatus, closed_at: null })
    .eq("id", queryId);

  // Notify the assigned admin, or all admins when unassigned.
  try {
    const targets = query.assigned_admin_id
      ? [{ userId: query.assigned_admin_id }]
      : (await listAdminIds()).map((id) => ({ userId: id }));
    if (targets.length) {
      await createBulkNotifications(targets, {
        title: `Reply on query ${query.ticket}`,
        message: snippet(msg),
        type: "admin_message",
        category: "admin",
        priority: "normal",
        actionUrl: "/admin/queries",
        createdBy: userId,
        sendEmail: false,
      });
    }
  } catch (e) {
    console.error("replyAsUser admin notify failed:", e.message);
  }

  return row;
}

// ── User: reopen a resolved/closed query ──────────────────────────────────────

export async function reopenQuery(userId, queryId, message) {
  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("*")
    .eq("id", queryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);
  if (!["resolved", "closed"].includes(query.status)) {
    throw new SupportError("Only a resolved or closed query can be reopened.", 409);
  }

  await supabaseAdmin
    .from(Q_TABLE)
    .update({ status: "open", closed_at: null, last_message_at: new Date().toISOString() })
    .eq("id", queryId);

  const msg = trim(message);
  if (msg) await replyAsUser(userId, queryId, msg);
  return { reopened: true };
}

// ── User: mark own query as resolved ──────────────────────────────────

/**
 * A user closing their own ticket. Only queries still in a live state can be
 * resolved; 'resolved'/'closed' are rejected so this never masks a real
 * admin-side closure. Mirrors adminUpdateQuery's closed_at convention.
 */
export async function resolveQuery(userId, queryId) {
  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("*")
    .eq("id", queryId)
    .eq("user_id", userId) // ownership enforced
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);
  if (["resolved", "closed"].includes(query.status)) {
    throw new SupportError("This query is already resolved or closed.", 409);
  }

  const now = new Date().toISOString();
  const { data: updated, error: uErr } = await supabaseAdmin
    .from(Q_TABLE)
    .update({ status: "resolved", closed_at: now })
    .eq("id", queryId)
    .eq("user_id", userId)
    .select()
    .single();
  if (uErr) throw new SupportError(uErr.message, 500);

  // Let the assigned admin (or all admins) know the user closed it. Best-effort.
  try {
    const targets = query.assigned_admin_id
      ? [{ userId: query.assigned_admin_id }]
      : (await listAdminIds()).map((id) => ({ userId: id }));
    if (targets.length) {
      await createBulkNotifications(targets, {
        title: `Query ${query.ticket} resolved by user`,
        message: snippet(query.subject),
        type: "admin_message",
        category: "admin",
        priority: "low",
        actionUrl: "/admin/queries",
        createdBy: userId,
        sendEmail: false,
      });
    }
  } catch (e) {
    console.error("resolveQuery admin notify failed:", e.message);
  }

  return updated;
}

// ── User: clear messages of own query (query record stays) ────────────────────

/**
 * Removes every message row belonging to the query — user replies, admin
 * replies AND admin internal notes (all are messages OF that query, spec
 * §15 scope) — while keeping the support_queries row itself untouched.
 * This is deliberately different from deleteQuery, which removes both.
 */
export async function clearQueryMessages(userId, queryId) {
  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("id")
    .eq("id", queryId)
    .eq("user_id", userId) // ownership enforced
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);

  const { count, error: dErr } = await supabaseAdmin
    .from(M_TABLE)
    .delete({ count: "exact" })
    .eq("query_id", queryId);
  if (dErr) throw new SupportError(dErr.message, 500);

  // Any cached unread badge for this user is now stale.
  await invalidateSupportUnread(userId);
  return { cleared: count ?? 0 };
}

// ── User: delete own query (and, via it, its messages) ─────────────────────────

/**
 * Permanently removes the query and its thread. Nothing else is touched —
 * predictions, notifications, chatbot history and other queries all live in
 * separate tables keyed by the user, not by the query.
 *
 * support_messages.query_id already has ON DELETE CASCADE, but the explicit
 * message delete first keeps the operation safe on databases where the FK
 * constraint was never applied. Both steps are scoped by the ownership check
 * above the delete, so a foreign query id in the request can never be hit.
 */
export async function deleteQuery(userId, queryId) {
  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("id, ticket")
    .eq("id", queryId)
    .eq("user_id", userId) // ownership enforced
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);

  const { error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .delete()
    .eq("query_id", queryId);
  if (mErr) throw new SupportError(mErr.message, 500);

  const { error: qErr } = await supabaseAdmin
    .from(Q_TABLE)
    .delete()
    .eq("id", queryId)
    .eq("user_id", userId);
  if (qErr) throw new SupportError(qErr.message, 500);

  await invalidateSupportUnread(userId);
  return { deleted: true, ticket: query.ticket };
}

// ── Admin: list (summary only, no thread loaded) ──────────────────────────

export async function adminListQueries({
  search = "", status = null, priority = null, category = null,
  assignedAdmin = null, from = null, to = null,
  sort = "last_message_at", page = 1, limit = 20,
} = {}) {
  const offset = (Math.max(1, page) - 1) * limit;
  const allowedSort = ["last_message_at", "created_at", "priority", "status"];
  const orderCol = allowedSort.includes(sort) ? sort : "last_message_at";

  let query = supabaseAdmin
    .from(Q_TABLE)
    .select("*", { count: "exact" });

  if (status)        query = query.eq("status", status);
  if (priority)      query = query.eq("priority", priority);
  if (category)      query = query.eq("category", category);
  if (assignedAdmin) query = query.eq("assigned_admin_id", assignedAdmin);
  if (from)          query = query.gte("created_at", from);
  if (to)            query = query.lte("created_at", to);

  const s = trim(search);
  if (s) {
    const like = `%${s}%`;
    query = query.or(
      `ticket.ilike.${like},subject.ilike.${like},user_name.ilike.${like},user_email.ilike.${like}`
    );
  }

  query = query.order(orderCol, { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new SupportError(error.message, 500);

  const ids = (data || []).map((q) => q.id);
  const tally = await messageSummaryFor(ids);

  const queries = (data || []).map((q) => ({
    ...q,
    message_count: tally[q.id]?.count ?? 0,
    unread_for_user: tally[q.id]?.unread ?? 0,
  }));

  return {
    queries,
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

// ── Admin: detail (thread incl. internal notes) ───────────────────────────────

export async function adminGetQueryDetail(queryId) {
  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("*")
    .eq("id", queryId)
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);

  const { data: messages, error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .select("*")
    .eq("query_id", queryId)
    .order("created_at", { ascending: true });
  if (mErr) throw new SupportError(mErr.message, 500);

  // Admin opened it -> mark the user's messages as admin-read.
  await supabaseAdmin
    .from(M_TABLE)
    .update({ admin_read: true })
    .eq("query_id", queryId)
    .eq("sender_type", "user")
    .eq("admin_read", false);

  return { query, messages: messages ?? [] };
}

// ── Admin: reply to user ──────────────────────────────────────────────────────

export async function adminReply(adminId, queryId, message, opts = {}) {
  const msg = trim(message);
  if (!msg) throw new SupportError("Reply message is required.");
  if (msg.length > 5000) throw new SupportError("Reply is too long (max 5000 characters).");

  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("*")
    .eq("id", queryId)
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);

  const admin = await getProfile(adminId);
  const now = new Date().toISOString();

  // Status transition: replying moves a brand-new query to open; admin can
  // explicitly resolve / set waiting_user via opts.status.
  const explicit = opts.status && QUERY_STATUSES.includes(opts.status) ? opts.status : null;
  let nextStatus = query.status === "new" ? "open" : query.status;
  if (explicit) nextStatus = explicit;
  const closedAt =
    nextStatus === "resolved" || nextStatus === "closed" ? now : null;

  const { data: row, error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .insert({
      query_id: queryId,
      sender_id: adminId,
      sender_type: "admin",
      message: msg,
      is_internal: false,
      user_read: false,
      admin_read: true,
    })
    .select()
    .single();
  if (mErr) throw new SupportError(mErr.message, 500);

  await supabaseAdmin
    .from(Q_TABLE)
    .update({ last_message_at: now, status: nextStatus, closed_at: closedAt })
    .eq("id", queryId);

  await invalidateSupportUnread(query.user_id);

  // In-app notification to the user (drives the header chat badge + bell).
  try {
    await createNotification({
      userId: query.user_id,
      title: `Support replied to "${query.subject}"`,
      message: snippet(msg),
      type: "admin_message",
      category: "admin",
      priority: "normal",
      actionUrl: "/support",
      metadata: { ticket: query.ticket, query_id: queryId },
      createdBy: adminId,
      sendEmail: false, // email handled below, gated on email_support
    });
  } catch (e) {
    console.error("adminReply notify failed:", e.message);
  }

  // Email to the user, gated on the email_support preference.
  if (query.user_email && (await supportEmailEnabled(query.user_id))) {
    queueEmail(
      sendSupportReplyEmail,
      [{
        to: query.user_email,
        name: query.user_name || "",
        ticket: query.ticket,
        subject: query.subject,
        replyMessage: msg,
        adminName: admin?.name || "Support Team",
        actionUrl: "/support",
      }],
      (err) => console.error("support reply email failed:", err.message)
    );
  }

  return row;
}

// ── Admin: update status / priority / assignment ──────────────────────────────

export async function adminUpdateQuery(adminId, queryId, patch = {}) {
  const update = {};

  if (patch.status !== undefined) {
    if (!QUERY_STATUSES.includes(patch.status)) throw new SupportError("Invalid status.");
    update.status = patch.status;
    update.closed_at =
      patch.status === "resolved" || patch.status === "closed"
        ? new Date().toISOString()
        : null;
  }
  if (patch.priority !== undefined) {
    if (!QUERY_PRIORITIES.includes(patch.priority)) throw new SupportError("Invalid priority.");
    update.priority = patch.priority;
  }
  if (patch.assigned_admin_id !== undefined) {
    update.assigned_admin_id = patch.assigned_admin_id || null;
  }

  if (!Object.keys(update).length) throw new SupportError("Nothing to update.");

  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("*")
    .eq("id", queryId)
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);

  const { data: updated, error: uErr } = await supabaseAdmin
    .from(Q_TABLE)
    .update(update)
    .eq("id", queryId)
    .select()
    .single();
  if (uErr) throw new SupportError(uErr.message, 500);

  // Tell the user when the query is resolved or explicitly waiting on them.
  if (update.status && ["resolved", "waiting_user", "closed"].includes(update.status)) {
    const label =
      update.status === "resolved" ? "has been marked resolved"
      : update.status === "closed" ? "has been closed"
      : "needs more information from you";
    try {
      await createNotification({
        userId: query.user_id,
        title: `Query ${query.ticket} ${label}`,
        message: `Your query "${query.subject}" ${label}.`,
        type: "admin_message",
        category: "admin",
        priority: "normal",
        actionUrl: "/support",
        metadata: { ticket: query.ticket, query_id: queryId, status: update.status },
        createdBy: adminId,
        sendEmail: false,
      });
      await invalidateSupportUnread(query.user_id);
    } catch (e) {
      console.error("adminUpdateQuery notify failed:", e.message);
    }
  }

  return updated;
}

// ── Admin: internal note (never surfaced to the user) ──────────────────────────

export async function adminAddNote(adminId, queryId, message) {
  const msg = trim(message);
  if (!msg) throw new SupportError("Note is required.");
  if (msg.length > 5000) throw new SupportError("Note is too long (max 5000 characters).");

  const { data: query, error } = await supabaseAdmin
    .from(Q_TABLE)
    .select("id")
    .eq("id", queryId)
    .maybeSingle();
  if (error) throw new SupportError(error.message, 500);
  if (!query) throw new SupportError("Query not found.", 404);

  const { data: row, error: mErr } = await supabaseAdmin
    .from(M_TABLE)
    .insert({
      query_id: queryId,
      sender_id: adminId,
      sender_type: "admin",
      message: msg,
      is_internal: true,
      user_read: true,   // never shown to the user
      admin_read: true,
    })
    .select()
    .single();
  if (mErr) throw new SupportError(mErr.message, 500);
  return row;
}

// ── Admin: stats + badge count ────────────────────────────────────────────────

export async function adminStats() {
  const base = () => supabaseAdmin.from(Q_TABLE).select("id", { count: "exact", head: true });
  const { count: total } = await base();
  const countStatus = async (s) => {
    const { count } = await base().eq("status", s);
    return count ?? 0;
  };
  const [news, open, waitingUser, waitingAdmin, resolved, closed] = await Promise.all([
    countStatus("new"), countStatus("open"), countStatus("waiting_user"),
    countStatus("waiting_admin"), countStatus("resolved"), countStatus("closed"),
  ]);
  return {
    total: total ?? 0,
    new: news,
    open,
    waiting_user: waitingUser,
    waiting_admin: waitingAdmin,
    resolved,
    closed,
  };
}

export async function adminNewCount() {
  const { count } = await supabaseAdmin
    .from(Q_TABLE)
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
  if (error) throw new SupportError(error.message, 500);
  return data ?? [];
}
