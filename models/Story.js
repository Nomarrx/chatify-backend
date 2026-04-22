const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'text'],
    required: true,
  },
  mediaData: { type: String },
  textOverlay: { type: String },
  textColor: { type: String, default: '#FFFFFF' },
  backgroundColor: { type: String, default: '#2444EB' },
  viewers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now },
  }],
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

storySchema.pre('save', function (next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date(this.createdAt.getTime() + 24 * 60 * 60 * 1000);
  }
  next();
});

// MongoDB TTL index — auto-removes documents after expiresAt
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Story', storySchema);
