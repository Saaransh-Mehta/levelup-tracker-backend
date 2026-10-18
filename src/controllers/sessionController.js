const mongoose = require("mongoose");
const Goal = require("../models/Goal");
const Session = require("../models/Session");
const Campaign = require("../models/Campaign");
const CampaignDay = require("../models/CampaignDay");

const MIN_MINUTES = 1;
const MAX_MINUTES = 240;
const OPEN = { $in: ["running", "paused"] };

// Every response carries the server clock so the client can correct for its own.
const send = (res, status, body) => res.status(status).json({ ...body, serverNow: Date.now() });

// A running session whose time is up is closed the next time anyone looks at it.
const settle = async (session) => {
  if (session && session.status === "running" && session.focusedSeconds() >= session.plannedSeconds) {
    session.close();
    await session.save();
  }
  return session;
};

const findOpen = async (userId) => settle(await Session.findOne({ user: userId, status: OPEN }));

// GET /api/sessions/active
const getActive = async (req, res) => {
  const session = await findOpen(req.userId);
  const open = session && ["running", "paused"].includes(session.status) ? session : null;
  send(res, 200, { session: open });
};

const readMinutes = (body) => {
  const minutes = Number(body.minutes);
  return Number.isInteger(minutes) && minutes >= MIN_MINUTES && minutes <= MAX_MINUTES ? minutes : null;
};

// Starts a session unless one is already open. Returns [status, body].
const createSession = async (userId, { goal = null, label = "", minutes, todo = null }) => {
  const open = await findOpen(userId);
  if (open && ["running", "paused"].includes(open.status)) {
    return [409, { message: "You already have a session running", session: open }];
  }
  const session = await Session.create({
    user: userId,
    goal,
    label,
    ...(todo && { campaign: todo.campaign, campaignDate: todo.date, todo: todo._id }),
    plannedSeconds: minutes * 60,
    resumedAt: new Date(),
  });
  return [201, { session }];
};

const MINUTES_ERROR = `Pick between ${MIN_MINUTES} and ${MAX_MINUTES} minutes`;

// POST /api/goals/:id/sessions  { minutes }
const startSession = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return send(res, 404, { message: "Goal not found" });
  const goal = await Goal.findOne({ _id: req.params.id, user: req.userId });
  if (!goal) return send(res, 404, { message: "Goal not found" });
  const minutes = readMinutes(req.body);
  if (!minutes) return send(res, 400, { message: MINUTES_ERROR });
  send(res, ...(await createSession(req.userId, { goal: goal._id, minutes })));
};

// POST /api/sessions  { minutes, label? } — a free session, not tied to a goal.
const startFreeSession = async (req, res) => {
  const minutes = readMinutes(req.body);
  if (!minutes) return send(res, 400, { message: MINUTES_ERROR });
  const label = typeof req.body.label === "string" ? req.body.label.trim() : "";
  if (label.length > 80) return send(res, 400, { message: "Keep the label under 80 characters" });
  send(res, ...(await createSession(req.userId, { label, minutes })));
};

// The start of the user's today. The client sends its local midnight, since the server runs on UTC;
// anything missing or further than a day and a half off falls back to the server's midnight.
const readDayStart = (value) => {
  const date = new Date(value);
  if (typeof value === "string" && !isNaN(date) && Math.abs(Date.now() - date) <= 36 * 60 * 60 * 1000) return date;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return midnight;
};

// GET /api/sessions?limit=5&dayStart=ISO — recent sessions across goals and free ones, plus totals.
const listRecent = async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 5));
  const userId = new mongoose.Types.ObjectId(req.userId);
  const startOfDay = readDayStart(req.query.dayStart);

  const [sessions, [totals], [today]] = await Promise.all([
    Session.find({ user: req.userId, status: "completed" })
      .sort({ startedAt: -1 })
      .limit(limit)
      .populate("goal", "title icon"),
    Session.aggregate([
      { $match: { user: userId, status: "completed" } },
      { $group: { _id: null, count: { $sum: 1 }, seconds: { $sum: "$accumulatedSeconds" } } },
    ]),
    Session.aggregate([
      { $match: { user: userId, status: "completed", startedAt: { $gte: startOfDay } } },
      { $group: { _id: null, seconds: { $sum: "$accumulatedSeconds" } } },
    ]),
  ]);
  send(res, 200, {
    sessions,
    stats: { count: totals?.count || 0, seconds: totals?.seconds || 0, todaySeconds: today?.seconds || 0 },
  });
};

// The campaign to-do a session was spent on, as the focus screen shows it. Null if it's gone.
const todoFor = async (session) => {
  if (!session.todo) return null;
  const [campaign, day] = await Promise.all([
    Campaign.findById(session.campaign).select("name icon"),
    CampaignDay.findOne({ campaign: session.campaign, date: session.campaignDate }).select("todos"),
  ]);
  const todo = day?.todos.id(session.todo);
  if (!campaign || !todo) return null;
  return { _id: todo._id, text: todo.text, done: todo.done, date: session.campaignDate, campaign };
};

// GET /api/sessions/:id — includes the goal's title and icon (if any) for the focus screen, or the
// campaign to-do it's spent on.
const getSession = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return send(res, 404, { message: "Session not found" });
  const session = await settle(await Session.findOne({ _id: req.params.id, user: req.userId }));
  if (!session) return send(res, 404, { message: "Session not found" });
  const goal = session.goal ? await Goal.findById(session.goal).select("title icon") : null;
  send(res, 200, { session, goal, todo: await todoFor(session) });
};

// PATCH /api/sessions/:id  { action?: pause|resume|finish, notes?, distractions? }
const updateSession = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return send(res, 404, { message: "Session not found" });
  const session = await settle(await Session.findOne({ _id: req.params.id, user: req.userId }));
  if (!session) return send(res, 404, { message: "Session not found" });

  const { action, notes, distractions } = req.body;

  if (notes !== undefined) {
    if (typeof notes !== "string" || notes.length > 20000) return send(res, 400, { message: "Notes are too long" });
    session.notes = notes;
  }
  if (distractions !== undefined) {
    if (!Number.isInteger(distractions) || distractions < 0) return send(res, 400, { message: "Invalid distractions" });
    session.distractions = Math.max(session.distractions, distractions);
  }

  const open = ["running", "paused"].includes(session.status);
  const now = new Date();
  if (action === "pause" && session.status === "running") {
    session.accumulatedSeconds = session.focusedSeconds(now);
    session.resumedAt = null;
    session.status = "paused";
  } else if (action === "resume" && session.status === "paused") {
    session.resumedAt = now;
    session.status = "running";
  } else if (action === "finish" && open) {
    session.close(now);
  } else if (action !== undefined && !["pause", "resume", "finish"].includes(action)) {
    return send(res, 400, { message: "Unknown action" });
  }

  await session.save();
  send(res, 200, { session });
};

// GET /api/goals/:id/sessions — recent sessions and totals for one goal.
const listGoalSessions = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return send(res, 404, { message: "Goal not found" });
  const goal = await Goal.exists({ _id: req.params.id, user: req.userId });
  if (!goal) return send(res, 404, { message: "Goal not found" });

  const sessions = await Session.find({ goal: req.params.id, user: req.userId, status: { $ne: "abandoned" } })
    .sort({ startedAt: -1 })
    .limit(20);
  const [totals] = await Session.aggregate([
    { $match: { goal: new mongoose.Types.ObjectId(req.params.id), status: "completed" } },
    { $group: { _id: null, count: { $sum: 1 }, seconds: { $sum: "$accumulatedSeconds" } } },
  ]);
  send(res, 200, { sessions, stats: { count: totals?.count || 0, seconds: totals?.seconds || 0 } });
};

// Completed-session totals per goal, for the goal list.
const statsByGoal = async (userId) => {
  const rows = await Session.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), status: "completed", goal: { $ne: null } } },
    { $group: { _id: "$goal", count: { $sum: 1 }, seconds: { $sum: "$accumulatedSeconds" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { count: r.count, seconds: r.seconds }]));
};

// Completed-session seconds per to-do of one campaign, keyed by to-do id.
const secondsByTodo = async (userId, campaignId) => {
  const rows = await Session.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), campaign: campaignId, status: "completed" } },
    { $group: { _id: "$todo", seconds: { $sum: "$accumulatedSeconds" } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.seconds]));
};

module.exports = {
  send,
  readMinutes,
  createSession,
  MINUTES_ERROR,
  secondsByTodo,
  getActive,
  startSession,
  startFreeSession,
  listRecent,
  getSession,
  updateSession,
  listGoalSessions,
  statsByGoal,
};
