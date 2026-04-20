/**
 * File: models/Message.js
 * Description: Message schema for Chatify
 * Adapted from StudyHub messageController.js by Darrel Okoukoni & Divine Nworisa
 * Key change: removed listingID dependency, now direct user-to-user chat
 */

const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    // Who sent the message
    senderID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Who receives the message
    receiverID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The message content (optional when imageUrl is present)
    messageText: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    // Optional image attachment
    imageUrl: {
      type: String,
      default: null,
    },
    // Read receipt
    isRead: {
      type: Boolean,
      default: false,
    },
    // Delivery receipt — set when recipient's app fetches or receives the message
    deliveredAt: {
      type: Date,
      default: null,
    },
    // Soft delete support
    deletedBySender: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

// Index for fast conversation queries
messageSchema.index({ senderID: 1, receiverID: 1 });
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);