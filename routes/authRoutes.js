/**
 * File: routes/authRoutes.js
 * Description: Auth routes for Chatify
 * Author: Darrel Okoukoni & Divine Nworisa
 */

const { Router } = require("express");
const {
  register,
  login,
  verifyOtp,
  resendOtp,
  getMe,
  updateProfile,
  changePassword,
} = require("../controllers/authController");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, updateProfile);
router.patch("/password", authMiddleware, changePassword);

module.exports = router;
