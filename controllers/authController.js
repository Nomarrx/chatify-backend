/**
 * File: controllers/authController.js
 * Description: Register and login for Chatify
 * Author: Darrel Okoukoni & Divine Nworisa
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate fields
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "Email or username already taken" });
    }

    // Create user (password hashed in model pre-save hook)
    const user = await User.create({ username, email, password });

    // Return user + token
    res.status(201).json({
      success: true,
      token: generateToken(user._id),
      user,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Login existing user
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate fields
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Return user + token
    res.status(200).json({
      success: true,
      token: generateToken(user._id),
      user,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Get current logged in user
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Update current user's profile (username and/or profilePicture)
 * PUT /api/auth/me  — also exposed as PATCH /api/users/profile
 */
const updateProfile = async (req, res) => {
  try {
    const { username, profilePicture } = req.body;
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (profilePicture !== undefined) updates.profilePicture = profilePicture;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "Nothing to update" });
    }

    if (updates.username) {
      const taken = await User.findOne({ username: updates.username, _id: { $ne: req.user.userId } });
      if (taken) return res.status(400).json({ success: false, error: "Username already taken" });
    }

    const user = await User.findByIdAndUpdate(req.user.userId, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    res.json({ success: true, user });
  } catch (error) {
    console.error("updateProfile error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Change password
 * PATCH /api/auth/password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: "Current and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user.userId).select("+password");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, error: "Current password is incorrect" });

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("changePassword error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword };