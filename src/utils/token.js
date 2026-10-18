const jwt = require("jsonwebtoken");

const signToken = (user) =>
  // ts: issue time in milliseconds, so a token made right after a password change is told apart
  // from one made just before it.
  jwt.sign({ id: user._id, ts: Date.now() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

module.exports = { signToken };
