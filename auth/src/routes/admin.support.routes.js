/**
 * WheatGuard AI – Admin Support (Query) Routes
 * All routes require a valid Bearer JWT AND role === "admin".
 *
 * GET   /api/admin/support/queries          – list + filters + pagination
 * GET   /api/admin/support/queries/stats    – summary card counts
 * GET   /api/admin/support/queries/new-count– sidebar badge
 * GET   /api/admin/support/queries/admins   – assignable admins
 * GET   /api/admin/support/queries/:id      – detail + full thread
 * POST  /api/admin/support/queries/:id/messages – reply to user
 * POST  /api/admin/support/queries/:id/notes    – internal note (hidden)
 * PATCH /api/admin/support/queries/:id      – status / priority / assign
 */

import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  adminListQueries,
  adminGetQueryDetail,
  adminReply,
  adminUpdateQuery,
  adminAddNote,
  adminStats,
  adminNewCount,
  listAssignableAdmins,
} from "../services/support.service.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// ── Static segments first so they aren't captured by /:id ─────────────────────

router.get("/queries/stats", async (req, res) => {
  try {
    const stats = await adminStats();
    return res.json({ success: true, stats });
  } catch (err) {
    console.error("admin GET /support/queries/stats error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load stats." });
  }
});

router.get("/queries/new-count", async (req, res) => {
  try {
    const count = await adminNewCount();
    return res.json({ success: true, count });
  } catch (err) {
    console.error("admin GET /support/queries/new-count error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load count." });
  }
});

router.get("/queries/admins", async (req, res) => {
  try {
    const admins = await listAssignableAdmins();
    return res.json({ success: true, admins });
  } catch (err) {
    console.error("admin GET /support/queries/admins error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load admins." });
  }
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/queries", async (req, res) => {
  try {
    const result = await adminListQueries({
      search:        req.query.search || "",
      status:        req.query.status || null,
      priority:      req.query.priority || null,
      category:      req.query.category || null,
      assignedAdmin: req.query.assigned_admin || null,
      from:          req.query.from || null,
      to:            req.query.to || null,
      sort:          req.query.sort || "last_message_at",
      page:          Math.max(1, parseInt(req.query.page) || 1),
      limit:         Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("admin GET /support/queries error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load queries." });
  }
});

// ── Detail ────────────────────────────────────────────────────────────────────

router.get("/queries/:id", async (req, res) => {
  try {
    const result = await adminGetQueryDetail(req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("admin GET /support/queries/:id error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to load query." });
  }
});

// ── Reply ─────────────────────────────────────────────────────────────────────

router.post("/queries/:id/messages", async (req, res) => {
  try {
    const message = await adminReply(req.user.sub, req.params.id, req.body?.message, {
      status: req.body?.status,
    });
    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("admin POST /support/queries/:id/messages error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to send reply." });
  }
});

// ── Internal note ───────────────────────────────────────────────────────────────

router.post("/queries/:id/notes", async (req, res) => {
  try {
    const note = await adminAddNote(req.user.sub, req.params.id, req.body?.message);
    return res.status(201).json({ success: true, note });
  } catch (err) {
    console.error("admin POST /support/queries/:id/notes error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to add note." });
  }
});

// ── Update status / priority / assignment ──────────────────────────────────────

router.patch("/queries/:id", async (req, res) => {
  try {
    const query = await adminUpdateQuery(req.user.sub, req.params.id, {
      status: req.body?.status,
      priority: req.body?.priority,
      assigned_admin_id: req.body?.assigned_admin_id,
    });
    return res.json({ success: true, query });
  } catch (err) {
    console.error("admin PATCH /support/queries/:id error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to update query." });
  }
});

export default router;
