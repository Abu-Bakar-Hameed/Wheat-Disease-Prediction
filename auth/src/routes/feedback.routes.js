/**
 * WheatGuard AI – User Feedback Routes
 * All routes require a valid Bearer JWT (requireAuth).
 * user_id is ALWAYS derived from req.user.sub — never from the body.
 *
 * POST /api/feedback                     – submit feedback
 * GET  /api/feedback                     – list my feedback
 * GET  /api/feedback/unread-count        – badge (unread admin replies)
 * GET  /api/feedback/meta                – feedback types + require-rating flag
 * GET  /api/feedback/:id                 – one feedback + admin replies
 * POST /api/feedback/:id/messages        – optional follow-up reply
 */

import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createFeedback,
  listUserFeedback,
  getUserFeedback,
  addUserReply,
  getUserUnreadCount,
  getSettings,
  FEEDBACK_TYPES,
} from "../services/feedback.service.js";

const router = express.Router();
router.use(requireAuth);

// Static segments before /:id so they are never captured as an id.
router.get("/meta", async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({
      success: true,
      types: FEEDBACK_TYPES,
      require_rating: !!settings.require_rating,
    });
  } catch (err) {
    console.error("GET /feedback/meta error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load feedback meta." });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    const count = await getUserUnreadCount(req.user.sub);
    return res.json({ success: true, count });
  } catch (err) {
    console.error("GET /feedback/unread-count error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to get unread count." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { type, rating, message, category,
      conversation_id, message_id, provider, model } = req.body || {};
    const authProvider = req.user.provider || (req.user.email ? "email" : undefined);
    const feedback = await createFeedback({
      userId: req.user.sub,
      type, rating, message, category,
      authProvider,
      conversationId: conversation_id,
      messageId: message_id,
      provider, model,
    });
    return res.status(201).json({ success: true, feedback });
  } catch (err) {
    console.error("POST /feedback error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to submit feedback." });
  }
});

router.get("/", async (req, res) => {
  try {
    const feedback = await listUserFeedback(req.user.sub);
    return res.json({ success: true, feedback });
  } catch (err) {
    console.error("GET /feedback error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: "Failed to load your feedback." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await getUserFeedback(req.user.sub, req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("GET /feedback/:id error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to load feedback." });
  }
});

router.post("/:id/messages", async (req, res) => {
  try {
    const message = await addUserReply(req.user.sub, req.params.id, req.body?.message);
    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("POST /feedback/:id/messages error:", err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to send reply." });
  }
});

export default router;
