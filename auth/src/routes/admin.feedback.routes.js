/**
 * WheatGuard AI – Admin Feedback Routes
 * All routes require a valid Bearer JWT AND role === "admin".
 *
 * GET   /api/admin/feedback               – list + filters + pagination
 * GET   /api/admin/feedback/stats         – summary card counts
 * GET   /api/admin/feedback/new-count     – sidebar badge
 * GET   /api/admin/feedback/analytics     – rating/type/trend/model breakdown
 * GET   /api/admin/feedback/admins        – assignable admins
 * GET   /api/admin/feedback/settings      – prompt settings
 * PATCH /api/admin/feedback/settings      – update prompt settings
 * GET   /api/admin/feedback/:id           – detail + replies + notes
 * POST  /api/admin/feedback/:id/messages  – reply to user
 * POST  /api/admin/feedback/:id/notes     – internal note (hidden from user)
 * PATCH /api/admin/feedback/:id           – status / priority / assign
 * DELETE/api/admin/feedback/:id           – delete feedback
 */

import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  adminListFeedback,
  adminGetFeedbackDetail,
  adminReply,
  adminAddNote,
  adminUpdateFeedback,
  adminDeleteFeedback,
  adminStats,
  adminNewCount,
  listAssignableAdmins,
  analytics,
  getSettings,
  updateSettings,
} from "../services/feedback.service.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// ── Static segments first so they aren't captured by /:id ─────────────────────

router.get("/stats", async (req, res) => {
  try {
    const stats = await adminStats();
    return res.json({ success: true, stats });
  } catch (err) {
    console.error("admin GET /feedback/stats error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load stats." });
  }
});

router.get("/new-count", async (req, res) => {
  try {
    const count = await adminNewCount();
    return res.json({ success: true, count });
  } catch (err) {
    console.error("admin GET /feedback/new-count error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load count." });
  }
});

router.get("/admins", async (req, res) => {
  try {
    const admins = await listAssignableAdmins();
    return res.json({ success: true, admins });
  } catch (err) {
    console.error("admin GET /feedback/admins error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load admins." });
  }
});

router.get("/analytics", async (req, res) => {
  try {
    const result = await analytics({
      days: parseInt(req.query.days) || 30,
      from: req.query.from || null,
      to: req.query.to || null,
    });
    return res.json({ success: true, analytics: result });
  } catch (err) {
    console.error("admin GET /feedback/analytics error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load analytics." });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({ success: true, settings });
  } catch (err) {
    console.error("admin GET /feedback/settings error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load settings." });
  }
});

router.patch("/settings", async (req, res) => {
  try {
    const settings = await updateSettings(req.body || {});
    return res.json({ success: true, settings });
  } catch (err) {
    console.error("admin PATCH /feedback/settings error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to update settings." });
  }
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const result = await adminListFeedback({
      search:        req.query.search || "",
      type:          req.query.type || null,
      status:        req.query.status || null,
      priority:      req.query.priority || null,
      rating:        req.query.rating || null,
      assignedAdmin: req.query.assigned_admin || null,
      from:          req.query.from || null,
      to:            req.query.to || null,
      sort:          req.query.sort || "created_at",
      page:          Math.max(1, parseInt(req.query.page) || 1),
      limit:         Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("admin GET /feedback error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load feedback." });
  }
});

// ── Detail ────────────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const result = await adminGetFeedbackDetail(req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("admin GET /feedback/:id error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to load feedback." });
  }
});

// ── Reply (visible to user) ─────────────────────────────────────────────────────

router.post("/:id/messages", async (req, res) => {
  try {
    const message = await adminReply(req.user.sub, req.params.id, req.body?.message);
    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("admin POST /feedback/:id/messages error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to send reply." });
  }
});

// ── Internal note (hidden from user) ────────────────────────────────────────────

router.post("/:id/notes", async (req, res) => {
  try {
    const note = await adminAddNote(req.user.sub, req.params.id, req.body?.note);
    return res.status(201).json({ success: true, note });
  } catch (err) {
    console.error("admin POST /feedback/:id/notes error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to add note." });
  }
});

// ── Update status / priority / assignment ──────────────────────────────────────

router.patch("/:id", async (req, res) => {
  try {
    const feedback = await adminUpdateFeedback(req.user.sub, req.params.id, {
      status: req.body?.status,
      priority: req.body?.priority,
      assigned_admin_id: req.body?.assigned_admin_id,
    });
    return res.json({ success: true, feedback });
  } catch (err) {
    console.error("admin PATCH /feedback/:id error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to update feedback." });
  }
});

// ── Delete ──────────────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const result = await adminDeleteFeedback(req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("admin DELETE /feedback/:id error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to delete feedback." });
  }
});

export default router;
