require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const goalRoutes = require("./routes/goalRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const habitRoutes = require("./routes/habitRoutes");
const financeRoutes = require("./routes/financeRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const { authLimiter } = require("./middleware/rateLimit");

// Sites allowed to call the API from a browser. CORS_ORIGINS (comma-separated) replaces the list.
const ORIGINS = (
  process.env.CORS_ORIGINS || "https://levelup-tracker-frontend.vercel.app,http://localhost:5173,http://localhost:4173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// The Express app on its own: server.js runs it locally, api/index.js serves it on Vercel.
const app = express();

// Vercel sits in front as a proxy; this makes req.ip the visitor's address for rate limiting.
app.set("trust proxy", 1);
app.use(cors({ origin: ORIGINS }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authLimiter);

// Every other route needs the database; the first request on a cold start waits for it.
app.use("/api", async (req, res, next) => {
  if (!process.env.MONGO_URI) return res.status(500).json({ message: "Database is not configured" });
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    res.status(503).json({ message: "Could not reach the database, please try again" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/habits", habitRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/campaigns", campaignRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong, please try again" });
});

module.exports = app;
