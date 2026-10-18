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

// The Express app on its own: server.js runs it locally, api/index.js serves it on Vercel.
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

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
