/**
 * File: middleware/authMiddleware.js
 * Description: JWT authentication middleware (same pattern as StudyHub)
 * Author: Darrel Okoukoni & Divine Nworisa
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "No token provided" });
    }

    // Extract the token
    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request (same pattern as your old authMiddleware)
    req.user = { userId: decoded.userId };

    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
};

module.exports = { authMiddleware };