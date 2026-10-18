const { rateLimit } = require("express-rate-limit");

// Counts per IP. On Vercel each warm instance keeps its own count, so these slow guessing down
// rather than stopping it outright.
const limiter = (minutes, limit) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: `Too many attempts. Please wait ${minutes} minutes and try again` },
  });

// Log in, sign up and reset: plenty for a person, too few for a password-guessing script.
const authLimiter = limiter(15, 20);
// Each request sends an email, so it gets a tighter limit of its own.
const resetEmailLimiter = limiter(60, 5);

module.exports = { authLimiter, resetEmailLimiter };
