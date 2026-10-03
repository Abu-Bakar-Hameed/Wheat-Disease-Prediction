/**
 * WheatGuard AI – Admin Notification Routes
 * All routes require valid Bearer JWT AND role === "admin".
 *
 * GET    /api/admin/notifications            – list all notifications (paginated)
 * GET    /api/admin/notifications/stats      – aggregate stats
 * POST   /api/admin/notifications            – create & send to specific user(s)
 * POST   /api/admin/notifications/broadcast  – send to all users / by role
 * DELETE /api/admin/notifications/:id        – hard delete any notification
 */

import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  createNotification,
  createBulkNotifications,
  adminGetNotifications,
  adminDeleteNotification,
  adminGetStats,
} from "../services/notification.service.js";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

// Auth guard: must be logged in AND have role "admin"
router.use(requireAuth, requireRole("admin"));

// ── GET /api/admin/notifications ──────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const limit    = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const search   = req.query.search   || "";
    const category = req.query.category || null;

    const result = await adminGetNotifications({ page, limit, search, category });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("admin GET /notifications error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load notifications." });
  }
});

// ── GET /api/admin/notifications/stats ────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const stats = await adminGetStats();
    return res.json({ success: true, stats });
  } catch (err) {
    console.error("admin GET /notifications/stats error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load stats." });
  }
});

// ── POST /api/admin/notifications ─────────────────────────────────────────────
// Send to one or more specific users
router.post("/", async (req, res) => {
  try {
    const adminId = req.user.sub;
    const {
      title, message = "", category = "admin", priority = "normal",
      action_url: actionUrl = null, send_email: sendEmail = false,
      user_ids,          // array of UUIDs
      user_id,           // single UUID (convenience)
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: "Title is required." });
    }

    const targets = [
      ...(Array.isArray(user_ids) ? user_ids : []),
      ...(user_id ? [user_id] : []),
    ].filter(Boolean);

    if (!targets.length) {
      return res.status(400).json({ success: false, message: "At least one user_id is required." });
    }

    // Fetch emails for targets if email send requested
    let recipientMap = {};
    if (sendEmail) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("id, email, name")
        .in("id", targets);
      (data || []).forEach(p => { recipientMap[p.id] = { email: p.email, name: p.name }; });
    }

    const recipients = targets.map(uid => ({
      userId: uid,
      userEmail: sendEmail ? recipientMap[uid]?.email : null,
      userName:  sendEmail ? recipientMap[uid]?.name  : "",
    }));

    const count = await createBulkNotifications(recipients, {
      title, message, type: "admin_message", category,
      priority, actionUrl, createdBy: adminId,
      sendEmail,
    });

    return res.status(201).json({
      success: true,
      created: count,
      message: `Notification sent to ${count} user(s).`,
    });
  } catch (err) {
    console.error("admin POST /notifications error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to create notification." });
  }
});

// ── POST /api/admin/notifications/broadcast ───────────────────────────────────
router.post("/broadcast", async (req, res) => {
  try {
    const adminId = req.user.sub;
    const {
      title, message = "", category = "system", priority = "normal",
      action_url: actionUrl = null, send_email: sendEmail = false,
      target = "all",   // "all" | "users" | "admins"
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: "Title is required." });
    }
    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }

    // Fetch all target profiles
    let query = supabaseAdmin.from("profiles").select("id, email, name, role");
    if (target === "users")  query = query.eq("role", "user");
    if (target === "admins") query = query.eq("role", "admin");

    const { data: profiles, error } = await query;
    if (error) throw new Error(error.message);

    const recipients = (profiles || []).map(p => ({
      userId: p.id,
      userEmail: sendEmail ? p.email : null,
      userName: p.name || "",
    }));

    if (!recipients.length) {
      return res.json({ success: true, created: 0, message: "No users found for target." });
    }

    const count = await createBulkNotifications(recipients, {
      title, message, type: "announcement", category,
      priority, actionUrl, createdBy: adminId,
      sendEmail,
    });

    return res.json({
      success: true,
      created: count,
      message: `Broadcast sent to ${count} user(s).`,
    });
  } catch (err) {
    console.error("admin POST /notifications/broadcast error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to broadcast notification." });
  }
});

// ── DELETE /api/admin/notifications/:id ──────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await adminDeleteNotification(req.params.id);
    return res.json({ success: true, message: "Notification deleted." });
  } catch (err) {
    console.error("admin DELETE /notifications/:id error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to delete notification." });
  }
});

export default router;

// ── GET /api/admin/notifications/email-log ────────────────────────────────────
// Email delivery audit log — admin only
import { getEmailAlertLogs } from "../services/notification.service.js";

router.get("/email-log", async (req, res) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page) || 1);
    const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const alertType = req.query.alert_type || null;

    const result = await getEmailAlertLogs({ page, limit, alertType });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("admin GET /email-log error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load email log." });
  }
});
