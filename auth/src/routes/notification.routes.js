/**
 * WheatGuard AI – User Notification Routes
 * All routes require a valid Bearer JWT (requireAuth middleware).
 * user_id is ALWAYS derived from req.user.sub — never from the body.
 *
 * GET    /api/notifications              – list with pagination & filters
 * GET    /api/notifications/unread-count – badge count
 * PATCH  /api/notifications/:id/read    – mark one as read
 * PATCH  /api/notifications/read-all    – mark all as read
 * DELETE /api/notifications/:id         – delete one
 * DELETE /api/notifications             – clear all (requires confirmation header)
 * GET    /api/notifications/preferences – get preferences
 * PUT    /api/notifications/preferences – save preferences
 */

import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  getNotificationPreferences,
  saveNotificationPreferences,
} from "../services/notification.service.js";

const router = express.Router();

// All routes are authenticated
router.use(requireAuth);

// ── GET /api/notifications ────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const userId = req.user.sub;
    const page       = Math.max(1, parseInt(req.query.page)  || 1);
    const limit      = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const unreadOnly = req.query.unread === "true";
    const category   = req.query.category || null;
    const type       = req.query.type     || null;

    const result = await getNotifications({ userId, page, limit, unreadOnly, category, type });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("GET /notifications error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load notifications." });
  }
});

// ── GET /api/notifications/unread-count ───────────────────────────────────────
// Must be defined BEFORE /:id routes to avoid being caught by the param handler
router.get("/unread-count", async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.sub);
    return res.json({ success: true, count });
  } catch (err) {
    console.error("GET /notifications/unread-count error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to get unread count." });
  }
});

// ── GET /api/notifications/preferences ───────────────────────────────────────
router.get("/preferences", async (req, res) => {
  try {
    const prefs = await getNotificationPreferences(req.user.sub);
    return res.json({ success: true, preferences: prefs });
  } catch (err) {
    console.error("GET /notifications/preferences error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load preferences." });
  }
});

// ── PUT /api/notifications/preferences ───────────────────────────────────────
router.put("/preferences", async (req, res) => {
  try {
    const userId = req.user.sub;
    const allowed = [
      "login_alerts","security_alerts","password_alerts","account_alerts",
      "system_alerts","admin_alerts","email_enabled","email_login",
      "email_security","email_password","email_account","email_system","email_admin",
      "email_support",
    ];
    const update = {};
    for (const key of allowed) {
      if (typeof req.body[key] === "boolean") update[key] = req.body[key];
    }
    const prefs = await saveNotificationPreferences(userId, update);
    return res.json({ success: true, preferences: prefs, message: "Preferences saved." });
  } catch (err) {
    console.error("PUT /notifications/preferences error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to save preferences." });
  }
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
router.patch("/read-all", async (req, res) => {
  try {
    await markAllAsRead(req.user.sub);
    return res.json({ success: true, message: "All notifications marked as read." });
  } catch (err) {
    console.error("PATCH /notifications/read-all error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to mark all as read." });
  }
});

// ── DELETE /api/notifications (clear all) ────────────────────────────────────
router.delete("/", async (req, res) => {
  try {
    // Require explicit confirmation to prevent accidental deletion
    if (req.headers["x-confirm-delete"] !== "clear-all") {
      return res.status(400).json({
        success: false,
        message: "Send header X-Confirm-Delete: clear-all to confirm.",
      });
    }
    await clearAllNotifications(req.user.sub);
    return res.json({ success: true, message: "All notifications cleared." });
  } catch (err) {
    console.error("DELETE /notifications error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to clear notifications." });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch("/:id/read", async (req, res) => {
  try {
    const updated = await markAsRead(req.params.id, req.user.sub);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    return res.json({ success: true, notification: updated });
  } catch (err) {
    console.error("PATCH /notifications/:id/read error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to mark as read." });
  }
});

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await deleteNotification(req.params.id, req.user.sub);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    return res.json({ success: true, message: "Notification deleted." });
  } catch (err) {
    console.error("DELETE /notifications/:id error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to delete notification." });
  }
});

export default router;
