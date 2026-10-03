/**
 * WheatGuard AI – User Support (Query) Routes
 * All routes require a valid Bearer JWT (requireAuth).
 * user_id is ALWAYS derived from req.user.sub — never from the body.
 *
 * POST   /api/support/queries               – create a new query
 * GET    /api/support/queries               – list my queries
 * GET    /api/support/queries/unread-count  – header badge count
 * GET    /api/support/queries/:id           – one query + thread
 * POST   /api/support/queries/:id/messages  – reply
 * POST   /api/support/queries/:id/reopen    – reopen resolved/closed
 * POST   /api/support/queries/:id/resolve   – mark my open query resolved
 * DELETE /api/support/queries/:id/messages  – clear thread, keep the query
 * DELETE /api/support/queries/:id           – delete query + its messages
 */

import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createQuery,
  listUserQueries,
  getUserQuery,
  replyAsUser,
  reopenQuery,
  resolveQuery,
  clearQueryMessages,
  deleteQuery,
  getUnreadCountForUser,
} from "../services/support.service.js";

const router = express.Router();
router.use(requireAuth);

// Static segment before /:id so it is never captured as an id.
router.get("/queries/unread-count", async (req, res) => {
  try {
    const count = await getUnreadCountForUser(req.user.sub);
    return res.json({ success: true, count });
  } catch (err) {
    console.error("GET /support/queries/unread-count error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to get unread count." });
  }
});

router.post("/queries", async (req, res) => {
  try {
    const { subject, message, category } = req.body || {};
    const provider = req.user.provider || (req.user.email ? "email" : undefined);
    const query = await createQuery({
      userId: req.user.sub,
      subject,
      message,
      category,
      provider,
    });
    return res.status(201).json({ success: true, query });
  } catch (err) {
    console.error("POST /support/queries error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to create query." });
  }
});

router.get("/queries", async (req, res) => {
  try {
    const queries = await listUserQueries(req.user.sub);
    return res.json({ success: true, queries });
  } catch (err) {
    console.error("GET /support/queries error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load queries." });
  }
});

router.get("/queries/:id", async (req, res) => {
  try {
    const result = await getUserQuery(req.user.sub, req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("GET /support/queries/:id error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to load query." });
  }
});

router.post("/queries/:id/messages", async (req, res) => {
  try {
    const message = await replyAsUser(req.user.sub, req.params.id, req.body?.message);
    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("POST /support/queries/:id/messages error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to send reply." });
  }
});

router.post("/queries/:id/reopen", async (req, res) => {
  try {
    const result = await reopenQuery(req.user.sub, req.params.id, req.body?.message);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("POST /support/queries/:id/reopen error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to reopen query." });
  }
});

router.post("/queries/:id/resolve", async (req, res) => {
  try {
    const query = await resolveQuery(req.user.sub, req.params.id);
    return res.json({ success: true, query });
  } catch (err) {
    console.error("POST /support/queries/:id/resolve error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to resolve query." });
  }
});

// Clearing messages keeps the query row; deleting the query removes both.
// The two operations are intentionally separate endpoints (/messages vs /:id).
router.delete("/queries/:id/messages", async (req, res) => {
  try {
    const result = await clearQueryMessages(req.user.sub, req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("DELETE /support/queries/:id/messages error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to clear messages." });
  }
});

router.delete("/queries/:id", async (req, res) => {
  try {
    const result = await deleteQuery(req.user.sub, req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("DELETE /support/queries/:id error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to delete query." });
  }
});

export default router;
