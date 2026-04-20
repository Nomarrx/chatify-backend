/**
 * File: socket/socketHandler.js
 * Description: Socket.IO real-time messaging engine for Chatify
 * Author: Darrel Okoukoni & Divine Nworisa
 */

const Message = require("../models/Message");
const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

// Map to track which socket belongs to which user
// { userId: socketId }
const onlineUsers = new Map();

const socketHandler = (io) => {
  // ── Auth middleware for Socket.IO ──────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  // ── Connection ─────────────────────────────────────────────────────────────
  io.on("connection", async (socket) => {
    console.log(`🟢 User connected: ${socket.userId} (socket: ${socket.id})`);

    onlineUsers.set(socket.userId, socket.id);

    await User.findByIdAndUpdate(socket.userId, { isOnline: true, lastHeartbeat: new Date() });

    // Join all group rooms this user belongs to
    try {
      const groups = await Group.find({ members: socket.userId });
      for (const group of groups) {
        socket.join(`group_${group._id}`);
      }
    } catch (err) {
      console.error("Error joining group rooms:", err);
    }

    socket.broadcast.emit("user_online", { userId: socket.userId });

    // ── Send Message (real-time) ─────────────────────────────────────────────
    socket.on("send_message", async (data) => {
      try {
        const { receiverID, messageText } = data;

        if (!receiverID || !messageText) return;

        const message = await Message.create({
          senderID: socket.userId,
          receiverID,
          messageText,
        });

        await message.populate("senderID", "username profilePicture");
        await message.populate("receiverID", "username profilePicture");

        socket.emit("message_sent", { success: true, message });

        const receiverSocketId = onlineUsers.get(receiverID);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("receive_message", { message });
          await Message.findByIdAndUpdate(message._id, { deliveredAt: new Date() });
          socket.emit("message_delivered", { messageId: message._id });
        }
      } catch (error) {
        console.error("Socket send_message error:", error);
        socket.emit("message_error", { error: "Failed to send message" });
      }
    });

    // ── Send Group Message (real-time) ───────────────────────────────────────
    socket.on("send_group_message", async (data) => {
      try {
        const { groupId, messageText, imageUrl } = data;
        if (!groupId || (!messageText && !imageUrl)) return;

        const group = await Group.findById(groupId);
        if (!group) return;

        const isMember = group.members.map((m) => m.toString()).includes(socket.userId);
        if (!isMember) return;

        const message = await GroupMessage.create({
          groupId,
          senderID: socket.userId,
          messageText: messageText || "",
          imageUrl: imageUrl || null,
          readBy: [socket.userId],
        });

        await message.populate("senderID", "username profilePicture");
        await Group.findByIdAndUpdate(groupId, { updatedAt: new Date() });

        io.to(`group_${groupId}`).emit("group_message_received", { message });
      } catch (error) {
        console.error("Socket send_group_message error:", error);
      }
    });

    // ── Join a group room ────────────────────────────────────────────────────
    socket.on("join_group", (groupId) => {
      socket.join(`group_${groupId}`);
    });

    // ── Typing Indicator ─────────────────────────────────────────────────────
    socket.on("typing_start", ({ receiverID }) => {
      const receiverSocketId = onlineUsers.get(receiverID);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("user_typing", {
          userId: socket.userId,
          isTyping: true,
        });
      }
    });

    socket.on("typing_stop", ({ receiverID }) => {
      const receiverSocketId = onlineUsers.get(receiverID);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("user_typing", {
          userId: socket.userId,
          isTyping: false,
        });
      }
    });

    // ── Mark as Read ─────────────────────────────────────────────────────────
    socket.on("mark_read", async ({ messageId, senderID }) => {
      try {
        await Message.findByIdAndUpdate(messageId, { isRead: true });

        const senderSocketId = onlineUsers.get(senderID);
        if (senderSocketId) {
          io.to(senderSocketId).emit("message_read", { messageId });
        }
      } catch (error) {
        console.error("Socket mark_read error:", error);
      }
    });

    // ── Delete Message (for everyone) ────────────────────────────────────────
    socket.on("delete_message", async ({ messageId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;
        if (message.senderID.toString() !== socket.userId) return;

        const receiverId = message.receiverID.toString();
        await message.deleteOne();

        // Notify receiver to remove from their UI
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("message_deleted", { messageId });
        }
        // Confirm to sender
        socket.emit("message_deleted", { messageId });
      } catch (error) {
        console.error("Socket delete_message error:", error);
      }
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      console.log(`🔴 User disconnected: ${socket.userId}`);

      onlineUsers.delete(socket.userId);

      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastSeen: new Date(),
      });

      socket.broadcast.emit("user_offline", { userId: socket.userId });
    });
  });
};

module.exports = socketHandler;
