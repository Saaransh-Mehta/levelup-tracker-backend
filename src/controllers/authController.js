const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { generateUniqueUsername, generateUserId } = require("../utils/generateUsername");
const { signToken } = require("../utils/token");
const { checkNewPassword, changedNow } = require("../utils/password");
const { sendEmail } = require("../utils/email");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{10,15}$/;

// Where reset links point. APP_URL overrides it, e.g. for a preview deployment.
const APP_URL = process.env.APP_URL || "https://levelup-tracker-frontend.vercel.app";
const RESET_MINUTES = 30;
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// POST /api/auth/register
const register = async (req, res) => {
  const { email, phone, gender, dateOfBirth, password, confirmPassword } = req.body;

  if (!email || !phone || !gender || !dateOfBirth || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (typeof email !== "string" || typeof phone !== "string") {
    return res.status(400).json({ message: "Please enter a valid email and phone number" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email" });
  }
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ message: "Please enter a valid phone number" });
  }
  const passwordError = checkNewPassword(password, confirmPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }
  const dob = new Date(dateOfBirth);
  if (isNaN(dob) || dob >= new Date()) {
    return res.status(400).json({ message: "Please enter a valid date of birth" });
  }

  const taken = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { phone }],
  });
  if (taken) {
    const field = taken.email === email.toLowerCase() ? "Email" : "Phone number";
    return res.status(409).json({ message: `${field} is already registered` });
  }

  const user = await User.create({
    userId: generateUserId(),
    username: await generateUniqueUsername(User),
    email,
    phone,
    gender,
    dateOfBirth: dob,
    password: await bcrypt.hash(password, 10),
  });

  res.status(201).json({ token: signToken(user), user });
};

// POST /api/auth/login — identifier is the email or phone number used at sign-up.
const login = async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password || typeof password !== "string") {
    return res.status(400).json({ message: "Enter your email or phone and your password" });
  }

  const id = String(identifier).trim();
  const user = await User.findOne({
    $or: [{ email: id.toLowerCase() }, { phone: id }],
  }).select("+password");

  // Same message either way so the form doesn't reveal which accounts exist.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Email, phone or password is incorrect" });
  }

  res.json({ token: signToken(user), user });
};

// POST /api/auth/forgot-password  { email }
// Emails a one-time reset link. The reply is the same whether or not the email has an account.
const forgotPassword = async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email" });
  }

  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
    await user.save();

    const link = `${APP_URL}/reset-password?token=${token}`;
    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your LevelUp password",
        text: `Hi ${user.username},\n\nOpen this link to choose a new password:\n${link}\n\nIt works once and expires in ${RESET_MINUTES} minutes. If you didn't ask for this, you can ignore this email.`,
        html: `<p>Hi ${user.username},</p><p><a href="${link}">Choose a new password</a></p><p>The link works once and expires in ${RESET_MINUTES} minutes. If you didn't ask for this, you can ignore this email.</p>`,
      });
    } catch (err) {
      console.error(`Reset email failed: ${err.message}`);
      return res.status(502).json({ message: "Could not send the email right now, please try again" });
    }
  }

  res.json({ message: "If that email has an account, a reset link is on its way" });
};

// POST /api/auth/reset-password  { token, password, confirmPassword }
// Sets the new password, signs out every other device and signs this one in.
const resetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  if (typeof token !== "string" || !token) {
    return res.status(400).json({ message: "This reset link is incomplete. Open it again from the email" });
  }
  const passwordError = checkNewPassword(password, confirmPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } });
  if (!user) {
    return res.status(400).json({ message: "This reset link has expired or was already used. Ask for a new one" });
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.passwordChangedAt = changedNow();
  await user.save();

  res.json({ token: signToken(user), user });
};

module.exports = { register, login, forgotPassword, resetPassword };
