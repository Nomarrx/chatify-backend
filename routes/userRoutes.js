const { Router } = require("express");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/authMiddleware");
const { updateProfile } = require("../controllers/authController");

const router = Router();

// In-memory typing status: key = `${senderId}_${receiverId}`, value = { isTyping, timestamp }
const typingStatusMap = new Map();

// Search users by username
// GET /api/users/search?q=divine
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, error: "Query required" });

    const users = await User.find({
      username: { $regex: q, $options: "i" },
      _id: { $ne: req.user.userId },
    }).select("username profilePicture isOnline lastSeen").limit(20);

    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Get all users except yourself
// GET /api/users
router.get("/", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.userId } })
      .select("username profilePicture isOnline lastSeen")
      .limit(50);

    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Update profile (username + profilePicture / base64)
// PATCH /api/users/profile
router.patch("/profile", authMiddleware, updateProfile);

// Set current user's online/offline status via HTTP
// PATCH /api/users/online  body: { isOnline: true|false }
router.patch("/online", authMiddleware, async (req, res) => {
  try {
    const { isOnline } = req.body;
    const update = { isOnline: !!isOnline };
    if (!isOnline) update.lastSeen = new Date();
    await User.findByIdAndUpdate(req.user.userId, update);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Heartbeat keepalive — called every 60s to maintain online status without USB/ADB
// PATCH /api/users/heartbeat
router.patch("/heartbeat", authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, {
      isOnline: true,
      lastHeartbeat: new Date(),
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Set typing status (HTTP fallback for when socket is unreliable on Render free tier)
// PATCH /api/users/typing  body: { isTyping: bool, receiverId: string }
router.patch("/typing", authMiddleware, (req, res) => {
  const { isTyping, receiverId } = req.body;
  if (!receiverId) return res.status(400).json({ success: false, error: "receiverId required" });
  const key = `${req.user.userId}_${receiverId}`;
  if (isTyping) {
    typingStatusMap.set(key, { isTyping: true, timestamp: Date.now() });
  } else {
    typingStatusMap.delete(key);
  }
  res.status(200).json({ success: true });
});

// Check if a specific user is currently typing to me
// GET /api/users/typing/:userId
router.get("/typing/:userId", authMiddleware, (req, res) => {
  const key = `${req.params.userId}_${req.user.userId}`;
  const entry = typingStatusMap.get(key);
  // Auto-expire after 5 seconds of no update
  if (entry && Date.now() - entry.timestamp > 5000) {
    typingStatusMap.delete(key);
    return res.status(200).json({ success: true, isTyping: false });
  }
  res.status(200).json({ success: true, isTyping: !!(entry && entry.isTyping) });
});

// Get online status for a set of user IDs
// GET /api/users/online-status?ids=id1,id2,id3
router.get("/online-status", authMiddleware, async (req, res) => {
  try {
    const ids = (req.query.ids || "").split(",").filter(Boolean);
    if (ids.length === 0) return res.status(200).json({ success: true, statuses: {} });
    const users = await User.find({ _id: { $in: ids } }).select("_id isOnline");
    const statuses = {};
    for (const u of users) statuses[u._id.toString()] = u.isOnline;
    res.status(200).json({ success: true, statuses });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Get a single user's public profile by ID
// GET /api/users/:id
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("username profilePicture isOnline lastSeen");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
