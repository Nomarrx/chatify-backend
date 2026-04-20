/**
 * File: controllers/messageController.js
 * Description: Controller handling direct messaging between users
 * Rewritten from StudyHub version by Darrel Okoukoni & Divine Nworisa
 * Changes: removed listingID, uses MongoDB/Mongoose instead of TypeORM
 * Date: 2025
 */

const Message = require("../models/Message");
const User = require("../models/User");

/**
 * Send a message to another user
 * POST /api/messages
 */
const sendMessage = async (req, res) => {
  try {
    const senderID = req.user.userId;
    const { receiverID, messageText, imageUrl } = req.body;

    if (!receiverID || (!messageText && !imageUrl)) {
      return res.status(400).json({
        success: false,
        error: "Receiver ID and message content are required",
      });
    }

    // Make sure receiver actually exists
    const receiver = await User.findById(receiverID);
    if (!receiver) {
      return res.status(404).json({ success: false, error: "Receiver not found" });
    }

    // Create and save message
    const message = await Message.create({
      senderID,
      receiverID,
      messageText: messageText || "",
      imageUrl: imageUrl || null,
    });

    // Populate sender/receiver info before returning
    await message.populate("senderID", "username profilePicture");
    await message.populate("receiverID", "username profilePicture");

    res.status(201).json({ success: true, message });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Get all messages for current user (inbox)
 * GET /api/messages
 */
const getMyMessages = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find all messages where user is sender or receiver
    const messages = await Message.find({
      $or: [{ senderID: userId }, { receiverID: userId }],
    })
      .populate("senderID", "username profilePicture isOnline")
      .populate("receiverID", "username profilePicture isOnline")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: messages.length, messages });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Get all conversations for current user
 * Groups by the other user, shows last message + unread count
 * GET /api/messages/conversations
 */
const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get all messages involving this user, most recent first
    const messages = await Message.find({
      $or: [{ senderID: userId }, { receiverID: userId }],
    })
      .populate("senderID", "username profilePicture isOnline lastSeen")
      .populate("receiverID", "username profilePicture isOnline lastSeen")
      .sort({ createdAt: -1 });

    // Group by the OTHER user in the conversation (same logic as your old controller)
    const conversationsMap = new Map();

    messages.forEach((message) => {
      const otherUser =
        message.senderID._id.toString() === userId
          ? message.receiverID
          : message.senderID;

      const key = otherUser._id.toString();

      if (!conversationsMap.has(key)) {
        conversationsMap.set(key, {
          conversationId: key,
          otherUser: {
            _id: otherUser._id,
            username: otherUser.username,
            profilePicture: otherUser.profilePicture,
            isOnline: otherUser.isOnline,
            lastSeen: otherUser.lastSeen,
          },
          lastMessage: message.messageText,
          lastMessageTime: message.createdAt,
          unreadCount: 0,
        });
      }

      // Count unread messages (same as your old getConversations)
      if (
        message.receiverID._id.toString() === userId &&
        !message.isRead
      ) {
        conversationsMap.get(key).unreadCount++;
      }
    });

    const conversations = Array.from(conversationsMap.values());
    res.status(200).json({ success: true, count: conversations.length, conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Get all messages between current user and another user
 * Also marks received messages as read
 * GET /api/messages/:otherUserId
 */
const getChatMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otherUserId } = req.params;

    // Get messages between these two users (same query pattern as your old getChatMessages)
    const messages = await Message.find({
      $or: [
        { senderID: userId, receiverID: otherUserId },
        { senderID: otherUserId, receiverID: userId },
      ],
    })
      .populate("senderID", "username profilePicture")
      .populate("receiverID", "username profilePicture")
      .sort({ createdAt: "asc" });

    // Mark received messages as delivered (recipient opened the chat)
    await Message.updateMany(
      { senderID: otherUserId, receiverID: userId, deliveredAt: null },
      { deliveredAt: new Date() }
    );

    // Auto mark received messages as read
    await Message.updateMany(
      { senderID: otherUserId, receiverID: userId, isRead: false },
      { isRead: true }
    );

    res.status(200).json({ success: true, count: messages.length, messages });
  } catch (error) {
    console.error("Get chat messages error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Mark a message as read
 * PUT /api/messages/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    // Only receiver can mark as read (same rule as your old controller)
    if (message.receiverID.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: "You can only mark your own received messages as read",
      });
    }

    message.isRead = true;
    await message.save();

    res.status(200).json({ success: true, message: "Message marked as read" });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Delete a message
 * DELETE /api/messages/:id
 */
const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    // Only sender can delete (same rule as your old controller)
    if (message.senderID.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own messages",
      });
    }

    await message.deleteOne();
    res.status(200).json({ success: true, message: "Message deleted successfully" });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Delete all messages between current user and another user
 * DELETE /api/messages/clear/:otherUserId
 */
const clearChat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otherUserId } = req.params;

    await Message.deleteMany({
      $or: [
        { senderID: userId, receiverID: otherUserId },
        { senderID: otherUserId, receiverID: userId },
      ],
    });

    res.status(200).json({ success: true, message: "Chat cleared" });
  } catch (error) {
    console.error("Clear chat error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

module.exports = {
  sendMessage,
  getMyMessages,
  getConversations,
  getChatMessages,
  markAsRead,
  deleteMessage,
  clearChat,
};