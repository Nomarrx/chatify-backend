/**
 * File: server.js
 * Description: Chatify backend entry point - Express + Socket.IO + MongoDB
 * Author: Darrel Okoukoni & Divine Nworisa
 */

require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/database");
const authRoutes = require("./routes/authRoutes");
const messageRoutes = require("./routes/messageRoutes");
const socketHandler = require("./socket/socketHandler");
const User = require("./models/User");

const app = express();
const httpServer = http.createServer(app);

// ── Socket.IO setup ──────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
  },
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json({ limit: '20mb' }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

const groupRoutes = require("./routes/groupRoutes");
app.use("/api/groups", groupRoutes);

const storyRoutes = require("./routes/storyRoutes");
app.use("/api/stories", storyRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Chatify backend is running 🚀" });
});

// ── Socket.IO handler ────────────────────────────────────────────────────────
socketHandler(io);

// ── Heartbeat background job ─────────────────────────────────────────────────
// Sets users offline if their lastHeartbeat is older than 2 minutes.
// This makes online status work without requiring a USB/ADB connection.
setInterval(async () => {
  try {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    await User.updateMany(
      { isOnline: true, lastHeartbeat: { $lt: twoMinutesAgo } },
      { isOnline: false, lastSeen: new Date() }
    );
  } catch (err) {
    console.error("Heartbeat cleanup error:", err);
  }
}, 60 * 1000);

// ── Expired story cleanup (runs hourly; TTL index also handles this) ─────────
const Story = require("./models/Story");
setInterval(async () => {
  try {
    await Story.deleteMany({ expiresAt: { $lt: new Date() } });
  } catch (err) {
    console.error("Story cleanup error:", err);
  }
}, 60 * 60 * 1000);

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Chatify server running on port ${PORT}`);
  });
});
