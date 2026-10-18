const User = require("../models/User");
const { WORK_STYLES, MOTIVATIONS, BLOCKERS } = require("../models/User");

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
    { new: true }
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
  const user = await User.findByIdAndUpdate(req.userId, { focusApps: clean }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
};

module.exports = { getMe, savePersonality, saveFocusApps };
