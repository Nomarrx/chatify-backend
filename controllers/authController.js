/**
 * File: controllers/authController.js
 * Description: Register / login / OTP verification for Chatify
 * Author: Darrel Okoukoni & Divine Nworisa
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { sendOtpEmail } = require("../utils/mailer");

const OTP_TTL_MS = 10 * 60 * 1000;        // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const OTP_MAX_ATTEMPTS = 5;

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Generate a 6-digit OTP as a zero-padded string
const generateOtp = () => {
  const n = crypto.randomInt(0, 1000000);
  return n.toString().padStart(6, "0");
};

// Hash an OTP the same way we hash passwords
const hashOtp = async (otp) => bcrypt.hash(otp, 10);

// Issue a new OTP: generates, hashes, stores on user, emails it.
// Rate-limited: throws RATE_LIMITED if called within OTP_RESEND_COOLDOWN_MS.
async function issueOtp(user) {
  const now = Date.now();
  if (
    user.otpLastSentAt &&
    now - new Date(user.otpLastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    const err = new Error("RATE_LIMITED");
    err.code = "RATE_LIMITED";
    throw err;
  }

  const otp = generateOtp();
  user.otpHash = await hashOtp(otp);
  user.otpExpiresAt = new Date(now + OTP_TTL_MS);
  user.otpAttempts = 0;
  user.otpLastSentAt = new Date(now);
  await user.save();

  await sendOtpEmail(user.email, otp);
}

/**
 * Register a new user
 * POST /api/auth/register
 * Creates unverified user, emails OTP. No token returned until verified.
 */
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // If a verified user already exists, block registration.
    // If an unverified user exists (e.g. they abandoned signup), overwrite their
    // pending credentials and send a fresh OTP so they can finish.
    const existingByEmail = await User.findOne({ email: normalizedEmail }).select(
      "+otpHash +otpExpiresAt +otpAttempts +otpLastSentAt"
    );

    if (existingByEmail && existingByEmail.emailVerified) {
      return res.status(400).json({ success: false, error: "Email already registered" });
    }

    // Make sure the username isn't taken by a *different* verified account.
    const usernameOwner = await User.findOne({ username });
    if (
      usernameOwner &&
      usernameOwner.emailVerified &&
      (!existingByEmail || usernameOwner._id.toString() !== existingByEmail._id.toString())
    ) {
      return res.status(400).json({ success: false, error: "Username already taken" });
    }

    let user;
    if (existingByEmail) {
      existingByEmail.username = username;
      existingByEmail.password = password; // pre-save hook rehashes
      user = existingByEmail;
    } else {
      user = new User({ username, email: normalizedEmail, password, emailVerified: false });
    }

    try {
      await issueOtp(user); // also saves user
    } catch (err) {
      if (err.code === "RATE_LIMITED") {
        // save pending credentials even if we're throttled on send
        if (user.isNew) await user.save();
        return res.status(429).json({
          success: false,
          error: "Please wait a minute before requesting another code.",
          requiresVerification: true,
          email: user.email,
        });
      }
      throw err;
    }

    res.status(201).json({
      success: true,
      requiresVerification: true,
      email: user.email,
      message: "Verification code sent. Check your email.",
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
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    if (!user.emailVerified) {
      // Best-effort resend so the user can jump straight to the OTP screen.
      try {
        const full = await User.findById(user._id).select(
          "+otpHash +otpExpiresAt +otpAttempts +otpLastSentAt"
        );
        await issueOtp(full);
      } catch (_) {
        // ignore rate-limit / send errors; user can use Resend button
      }
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        error: "Email not verified. We've sent you a new code.",
      });
    }

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
 * Verify OTP
 * POST /api/auth/verify-otp  { email, otp }
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: "Email and code are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+otpHash +otpExpiresAt +otpAttempts +otpLastSentAt"
    );

    if (!user) {
      return res.status(404).json({ success: false, error: "Account not found" });
    }
    if (user.emailVerified) {
      return res.status(200).json({
        success: true,
        token: generateToken(user._id),
        user,
      });
    }
    if (!user.otpHash || !user.otpExpiresAt) {
      return res.status(400).json({ success: false, error: "No pending code. Request a new one." });
    }
    if (Date.now() > new Date(user.otpExpiresAt).getTime()) {
      return res.status(400).json({ success: false, error: "Code expired. Request a new one." });
    }
    if ((user.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({
        success: false,
        error: "Too many wrong attempts. Please request a new code.",
      });
    }

    const ok = await bcrypt.compare(String(otp), user.otpHash);
    if (!ok) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - user.otpAttempts);
      return res.status(400).json({
        success: false,
        error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
      });
    }

    user.emailVerified = true;
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    user.otpLastSentAt = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      token: generateToken(user._id),
      user,
    });
  } catch (error) {
    console.error("verifyOtp error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * Resend OTP
 * POST /api/auth/resend-otp  { email }
 */
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+otpHash +otpExpiresAt +otpAttempts +otpLastSentAt"
    );
    if (!user) {
      return res.status(404).json({ success: false, error: "Account not found" });
    }
    if (user.emailVerified) {
      return res.status(400).json({ success: false, error: "Email already verified" });
    }

    try {
      await issueOtp(user);
    } catch (err) {
      if (err.code === "RATE_LIMITED") {
        const waitMs =
          OTP_RESEND_COOLDOWN_MS -
          (Date.now() - new Date(user.otpLastSentAt).getTime());
        const waitSec = Math.max(1, Math.ceil(waitMs / 1000));
        return res.status(429).json({
          success: false,
          error: `Please wait ${waitSec}s before requesting another code.`,
          retryAfter: waitSec,
        });
      }
      throw err;
    }

    res.status(200).json({ success: true, message: "A new code has been sent." });
  } catch (error) {
    console.error("resendOtp error:", error);
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

module.exports = {
  register,
  login,
  verifyOtp,
  resendOtp,
  getMe,
  updateProfile,
  changePassword,
};
