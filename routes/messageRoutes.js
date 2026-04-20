/**
 * File: routes/messageRoutes.js
 * Description: Routes for Chatify messaging
 * Author: Darrel Okoukoni & Divine Nworisa
 */

const { Router } = require("express");
const {
  sendMessage,
  getMyMessages,
  getConversations,
  getChatMessages,
  markAsRead,
  deleteMessage,
  clearChat,
} = require("../controllers/messageController");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = Router();

// POST /api/messages - Send a message
router.post("/", authMiddleware, sendMessage);

// GET /api/messages - Get all messages (inbox)
router.get("/", authMiddleware, getMyMessages);

// GET /api/messages/conversations - Get all conversations grouped by user
router.get("/conversations", authMiddleware, getConversations);

// DELETE /api/messages/clear/:otherUserId - Delete all messages between two users
// Must be before /:id to avoid "clear" being treated as a message ID
router.delete("/clear/:otherUserId", authMiddleware, clearChat);

// GET /api/messages/:otherUserId - Get chat with a specific user
router.get("/:otherUserId", authMiddleware, getChatMessages);

// PUT /api/messages/:id/read - Mark message as read
router.put("/:id/read", authMiddleware, markAsRead);

// DELETE /api/messages/:id - Delete a message
router.delete("/:id", authMiddleware, deleteMessage);

module.exports = router;
