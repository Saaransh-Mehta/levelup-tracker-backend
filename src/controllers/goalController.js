const mongoose = require("mongoose");
const Goal = require("../models/Goal");
const { AREAS, STATUSES } = require("../models/Goal");
const Session = require("../models/Session");
const { statsByGoal } = require("./sessionController");

const MAX_CONTENT_BYTES = 500 * 1024;

// Counts to-do items in the editor document, and how many are ticked.
const countTasks = (node, tally = { done: 0, total: 0 }) => {
  if (!node || typeof node !== "object") return tally;
  if (node.type === "taskItem") {
    tally.total += 1;
    if (node.attrs?.checked) tally.done += 1;
  }
  if (Array.isArray(node.content)) node.content.forEach((child) => countTasks(child, tally));
  return tally;
};

// Validates the editable fields in a request body. Returns { fields } or { error }.
const readFields = (body, { requireTitle }) => {
  const fields = {};

  if (body.title !== undefined || requireTitle) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return { error: "Give your goal a name" };
    if (title.length > 200) return { error: "Goal name is too long" };
    fields.title = title;
  }
  if (body.icon !== undefined) {
    if (typeof body.icon !== "string" || !body.icon || body.icon.length > 16) return { error: "Invalid icon" };
    fields.icon = body.icon;
  }
  if (body.area !== undefined) {
    if (!AREAS.includes(body.area)) return { error: "Pick an area for this goal" };
    fields.area = body.area;
  }
  if (body.why !== undefined) {
    if (typeof body.why !== "string" || body.why.length > 2000) return { error: "Reason is too long" };
    fields.why = body.why.trim();
  }
  if (body.targetDate !== undefined) {
    if (body.targetDate === null) {
      fields.targetDate = null;
    } else {
      const date = new Date(body.targetDate);
      if (isNaN(date)) return { error: "Invalid target date" };
      fields.targetDate = date;
    }
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { error: "Invalid status" };
    fields.status = body.status;
  }
  if (body.content !== undefined) {
    if (body.content !== null && (typeof body.content !== "object" || body.content.type !== "doc")) {
      return { error: "Invalid note content" };
    }
    if (JSON.stringify(body.content).length > MAX_CONTENT_BYTES) return { error: "Note is too large" };
    fields.content = body.content;
    fields.progress = countTasks(body.content);
  }
  return { fields };
};

const findOwnGoal = (req) =>
  mongoose.isValidObjectId(req.params.id) ? Goal.findOne({ _id: req.params.id, user: req.userId }) : null;

// GET /api/goals — summaries without the note body, with session totals.
const listGoals = async (req, res) => {
  const [goals, stats] = await Promise.all([
    Goal.find({ user: req.userId }).select("-content").sort({ updatedAt: -1 }),
    statsByGoal(req.userId),
  ]);
  const none = { count: 0, seconds: 0 };
  res.json({ goals: goals.map((g) => ({ ...g.toJSON(), sessions: stats.get(String(g._id)) || none })) });
};

// POST /api/goals
const createGoal = async (req, res) => {
  const { fields, error } = readFields(req.body, { requireTitle: true });
  if (error) return res.status(400).json({ message: error });
  const goal = await Goal.create({ ...fields, user: req.userId });
  res.status(201).json({ goal });
};

// GET /api/goals/:id
const getGoal = async (req, res) => {
  const goal = await findOwnGoal(req);
  if (!goal) return res.status(404).json({ message: "Goal not found" });
  res.json({ goal });
};

// PATCH /api/goals/:id
const updateGoal = async (req, res) => {
  const { fields, error } = readFields(req.body, { requireTitle: false });
  if (error) return res.status(400).json({ message: error });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Goal not found" });

  const goal = await Goal.findOneAndUpdate({ _id: req.params.id, user: req.userId }, fields, {
    new: true,
    runValidators: true,
  });
  if (!goal) return res.status(404).json({ message: "Goal not found" });
  res.json({ goal });
};

// DELETE /api/goals/:id
const deleteGoal = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Goal not found" });
  const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!goal) return res.status(404).json({ message: "Goal not found" });
  await Session.deleteMany({ goal: goal._id, user: req.userId });
  res.json({ id: goal._id });
};

module.exports = { listGoals, createGoal, getGoal, updateGoal, deleteGoal };
