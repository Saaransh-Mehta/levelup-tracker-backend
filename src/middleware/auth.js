const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Accepts a valid token whose account still exists and whose password hasn't changed since it was
// issued, so a password change or reset signs out every other device.
const protect = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Not logged in" });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Session expired, please log in again" });
  }

  const user = await User.findById(payload.id).select("passwordChangedAt").lean();
  // Tokens from before ts was added only carry iat, in whole seconds.
  const issuedAt = payload.ts ?? payload.iat * 1000;
  if (!user || (user.passwordChangedAt && issuedAt < user.passwordChangedAt.getTime())) {
    return res.status(401).json({ message: "Session expired, please log in again" });
  }
  req.userId = payload.id;
  next();
};

module.exports = { protect };
