const express = require("express");
const { register, login, forgotPassword, resetPassword } = require("../controllers/authController");
const { resetEmailLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", resetEmailLimiter, forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
