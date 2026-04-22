const { Router } = require('express');
const mongoose = require('mongoose');
const Story = require('../models/Story');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = Router();

// POST /api/stories — create a story
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { mediaType, mediaData, textOverlay, textColor, backgroundColor } = req.body;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const story = await Story.create({
      userId: req.user.userId,
      mediaType,
      mediaData,
      textOverlay,
      textColor: textColor || '#FFFFFF',
      backgroundColor: backgroundColor || '#2444EB',
      expiresAt,
    });
    await story.populate('userId', 'username profilePicture');
    res.status(201).json({ success: true, story });
  } catch (err) {
    console.error('createStory error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/stories — stories from people you've chatted with, grouped by user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const sentTo      = await Message.distinct('receiverID', { senderID: userId });
    const receivedFrom = await Message.distinct('senderID',   { receiverID: userId });
    const contactIds = [
      ...new Set([
        ...sentTo.map(id => id.toString()),
        ...receivedFrom.map(id => id.toString()),
      ])
    ].filter(id => id !== req.user.userId.toString());

    const now = new Date();
    const stories = await Story.find({
      userId: { $in: contactIds },
      expiresAt: { $gt: now },
    })
      .populate('userId', 'username profilePicture')
      .sort({ createdAt: -1 });

    // Group by user
    const grouped = {};
    for (const story of stories) {
      const uid = story.userId._id.toString();
      if (!grouped[uid]) {
        grouped[uid] = { user: story.userId, stories: [] };
      }
      grouped[uid].stories.push(story);
    }

    res.status(200).json({ success: true, stories: Object.values(grouped) });
  } catch (err) {
    console.error('getStories error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/stories/mine — your own active stories
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const stories = await Story.find({
      userId: req.user.userId,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, stories });
  } catch (err) {
    console.error('getMyStories error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/stories/:id/view — mark a story as viewed by the current user
router.post('/:id/view', authMiddleware, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, error: 'Story not found' });

    const alreadyViewed = story.viewers.some(
      v => v.userId.toString() === req.user.userId.toString()
    );
    if (!alreadyViewed) {
      story.viewers.push({ userId: req.user.userId, viewedAt: new Date() });
      await story.save();
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('viewStory error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/stories/:id — delete your own story
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const story = await Story.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!story) return res.status(404).json({ success: false, error: 'Story not found or not yours' });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('deleteStory error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
