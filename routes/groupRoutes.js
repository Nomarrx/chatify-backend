/**
 * File: routes/groupRoutes.js
 * Description: Group chat routes for Chatify
 * Author: Darrel Okoukoni & Divine Nworisa
 */

const { Router } = require("express");
const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = Router();

// ── Create a group ────────────────────────────────────────────────────────────
// POST /api/groups  body: { name, memberIds: [userId, ...] }
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, memberIds = [] } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Group name is required" });
    }

    // Always include the creator
    const allMembers = Array.from(new Set([...memberIds, req.user.userId]));

    const group = await Group.create({
      name: name.trim(),
      members: allMembers,
      admins: [req.user.userId],
      createdBy: req.user.userId,
    });

    await group.populate("members", "username profilePicture isOnline");
    await group.populate("createdBy", "username profilePicture");

    res.status(201).json({ success: true, group });
  } catch (error) {
    console.error("Create group error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Get all groups the current user belongs to ────────────────────────────────
// GET /api/groups
router.get("/", authMiddleware, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user.userId })
      .populate("members", "username profilePicture isOnline")
      .populate("createdBy", "username profilePicture")
      .sort({ updatedAt: -1 });

    // Attach lastMessage and unreadCount for each group
    const result = await Promise.all(
      groups.map(async (group) => {
        const lastMsg = await GroupMessage.findOne({ groupId: group._id })
          .sort({ createdAt: -1 })
          .populate("senderID", "username");

        const unreadCount = await GroupMessage.countDocuments({
          groupId: group._id,
          readBy: { $ne: req.user.userId },
          senderID: { $ne: req.user.userId },
        });

        return {
          _id: group._id,
          name: group.name,
          description: group.description,
          avatar: group.avatar,
          members: group.members,
          admins: group.admins,
          createdBy: group.createdBy,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
          lastMessage: lastMsg
            ? lastMsg.imageUrl
              ? "📷 Photo"
              : lastMsg.messageText
            : "",
          lastMessageTime: lastMsg ? lastMsg.createdAt : group.createdAt,
          unreadCount,
        };
      })
    );

    res.status(200).json({ success: true, groups: result });
  } catch (error) {
    console.error("Get groups error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Get messages for a group (marks them as read) ────────────────────────────
// GET /api/groups/:id/messages
router.get("/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }

    const isMember = group.members.map((m) => m.toString()).includes(req.user.userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: "Not a member of this group" });
    }

    const messages = await GroupMessage.find({ groupId: id })
      .populate("senderID", "username profilePicture")
      .sort({ createdAt: "asc" });

    // Mark all unread messages as read by this user
    await GroupMessage.updateMany(
      { groupId: id, readBy: { $ne: req.user.userId } },
      { $addToSet: { readBy: req.user.userId } }
    );

    res.status(200).json({ success: true, count: messages.length, messages });
  } catch (error) {
    console.error("Get group messages error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Send a message to a group ─────────────────────────────────────────────────
// POST /api/groups/:id/messages  body: { messageText?, imageUrl? }
router.post("/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { messageText, imageUrl } = req.body;

    if (!messageText && !imageUrl) {
      return res.status(400).json({ success: false, error: "Message content required" });
    }

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }

    const isMember = group.members.map((m) => m.toString()).includes(req.user.userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: "Not a member of this group" });
    }

    const message = await GroupMessage.create({
      groupId: id,
      senderID: req.user.userId,
      messageText: messageText || "",
      imageUrl: imageUrl || null,
      readBy: [req.user.userId],
    });

    await message.populate("senderID", "username profilePicture");

    // Bump the group's updatedAt so it sorts to top
    await Group.findByIdAndUpdate(id, { updatedAt: new Date() });

    res.status(201).json({ success: true, message });
  } catch (error) {
    console.error("Send group message error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Add a member to a group ───────────────────────────────────────────────────
// POST /api/groups/:id/members  body: { userId }
router.post("/:id/members", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }

    const isAdmin = group.admins.map((a) => a.toString()).includes(req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: "Only admins can add members" });
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    await Group.findByIdAndUpdate(id, { $addToSet: { members: userId } });
    const updated = await Group.findById(id).populate("members", "username profilePicture isOnline");

    res.status(200).json({ success: true, group: updated });
  } catch (error) {
    console.error("Add member error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Remove a member from a group ──────────────────────────────────────────────
// DELETE /api/groups/:id/members/:userId
router.delete("/:id/members/:userId", authMiddleware, async (req, res) => {
  try {
    const { id, userId } = req.params;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }

    const isAdmin = group.admins.map((a) => a.toString()).includes(req.user.userId);
    const isSelf = userId === req.user.userId;
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    await Group.findByIdAndUpdate(id, { $pull: { members: userId, admins: userId } });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Update group name / avatar ────────────────────────────────────────────────
// PATCH /api/groups/:id  body: { name?, avatar? }
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, avatar } = req.body;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }

    const isAdmin = group.admins.map((a) => a.toString()).includes(req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: "Only admins can update the group" });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (avatar !== undefined) updates.avatar = avatar;

    const updated = await Group.findByIdAndUpdate(id, updates, { new: true })
      .populate("members", "username profilePicture isOnline");

    res.status(200).json({ success: true, group: updated });
  } catch (error) {
    console.error("Update group error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
