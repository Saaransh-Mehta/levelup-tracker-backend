const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { WORK_STYLES, MOTIVATIONS, BLOCKERS } = require("../models/User");
const { signToken } = require("../utils/token");
const { checkNewPassword, changedNow } = require("../utils/password");

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

// GET /api/users/me
const getMe = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
};

// PUT /api/users/personality
const savePersonality = async (req, res) => {
  const { workStyle, motivation, blocker } = req.body;

  if (!WORK_STYLES.includes(workStyle) || !MOTIVATIONS.includes(motivation) || !BLOCKERS.includes(blocker)) {
    return res.status(400).json({ message: "Please answer all questions" });
  }

  const user = await User.findByIdAndUpdate(
    req.userId,
    { personality: { workStyle, motivation, blocker }, onboardingCompleted: true },
    { returnDocument: "after" }
  );
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
};

const MAX_FOCUS_APPS = 2;

// PUT /api/users/focus-apps  { apps: [{ name, url }] }
const saveFocusApps = async (req, res) => {
  const { apps } = req.body;
  if (!Array.isArray(apps) || apps.length > MAX_FOCUS_APPS) {
    return res.status(400).json({ message: `Pick up to ${MAX_FOCUS_APPS} apps` });
  }
  const clean = [];
  for (const app of apps) {
    const name = typeof app?.name === "string" ? app.name.trim() : "";
    let url;
    try {
      url = new URL(String(app?.url || "").trim());
    } catch {
      return res.status(400).json({ message: `"${name || "App"}" needs a full link, like https://docs.google.com` });
    }
    if (!name || name.length > 40) return res.status(400).json({ message: "Give each app a short name" });
    if (!["http:", "https:"].includes(url.protocol)) return res.status(400).json({ message: "Links must start with https://" });
    clean.push({ name, url: url.href });
  }
  const user = await User.findByIdAndUpdate(req.userId, { focusApps: clean }, { returnDocument: "after" });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
};

// PUT /api/users/username  { username } — letters, numbers and _, unique ignoring case.
const saveUsername = async (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ message: "Use 3 to 24 letters, numbers or _" });
  }
  const taken = await User.exists({ username, _id: { $ne: req.userId } }).collation({ locale: "en", strength: 2 });
  if (taken) return res.status(409).json({ message: "That username is taken" });

  const user = await User.findByIdAndUpdate(req.userId, { username }, { returnDocument: "after" });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
};

// PUT /api/users/password  { currentPassword, password, confirmPassword }
// Other devices are signed out; this one gets a fresh token.
const changePassword = async (req, res) => {
  const { currentPassword, password, confirmPassword } = req.body;
  if (typeof currentPassword !== "string" || !currentPassword) {
    return res.status(400).json({ message: "Enter your current password" });
  }
  const passwordError = checkNewPassword(password, confirmPassword);
  if (passwordError) return res.status(400).json({ message: passwordError });

  const user = await User.findById(req.userId).select("+password");
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(400).json({ message: "Current password is incorrect" });
  }

  user.password = await bcrypt.hash(password, 10);
  user.passwordChangedAt = changedNow();
  await user.save();
  res.json({ token: signToken(user), user });
};

module.exports = { getMe, savePersonality, saveFocusApps, saveUsername, changePassword };
