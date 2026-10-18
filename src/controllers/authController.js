const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { generateUniqueUsername, generateUserId } = require("../utils/generateUsername");
const { signToken } = require("../utils/token");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{10,15}$/;

// Keep in sync with PASSWORD_RULES in frontend/src/passwordRules.js
const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, message: "Password must be at least 8 characters" },
  { test: (p) => /[A-Z]/.test(p), message: "Password needs one uppercase letter" },
  { test: (p) => /\d/.test(p), message: "Password needs one number" },
  { test: (p) => /[^A-Za-z0-9]/.test(p), message: "Password needs one special character" },
];

// POST /api/auth/register
const register = async (req, res) => {
  const { email, phone, gender, dateOfBirth, password, confirmPassword } = req.body;

  if (!email || !phone || !gender || !dateOfBirth || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email" });
  }
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ message: "Please enter a valid phone number" });
  }
  const failedRule = PASSWORD_RULES.find((rule) => !rule.test(password));
  if (failedRule) {
    return res.status(400).json({ message: failedRule.message });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
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

  if (!identifier || !password) {
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

module.exports = { register, login };
