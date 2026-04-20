/**
 * File: models/GroupMessage.js
 * Description: Group message schema for Chatify
 * Author: Darrel Okoukoni & Divine Nworisa
 */

const mongoose = require("mongoose");

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    senderID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messageText: {
      type: String,
      default: "",
    },
    imageUrl: {
      type: String,
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

groupMessageSchema.index({ groupId: 1, createdAt: 1 });

module.exports = mongoose.model("GroupMessage", groupMessageSchema);
