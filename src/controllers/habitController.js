const mongoose = require("mongoose");
const Habit = require("../models/Habit");
const HabitLog = require("../models/HabitLog");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// How far back a day can still be ticked or have time added.
const EDITABLE_DAYS = 7;
const WEEK = 7;

// Calendar-day helpers on "YYYY-MM-DD" strings. UTC is used only as a neutral calendar.
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const formatDay = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
};
const weekday = (s) => parseDay(s).getUTCDay();
const isDay = (s) => typeof s === "string" && DATE_RE.test(s) && !isNaN(parseDay(s));

// The client sends its own "today" so streaks follow the user's timezone.
const readToday = (value) => (isDay(value) ? value : formatDay(new Date()));

// Validates the editable fields in a request body. Returns { fields } or { error }.
const readFields = (body, { requireTitle }) => {
  const fields = {};

  if (body.title !== undefined || requireTitle) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return { error: "Give your habit a name" };
    if (title.length > 120) return { error: "Habit name is too long" };
    fields.title = title;
  }
  if (body.icon !== undefined) {
    if (typeof body.icon !== "string" || !body.icon || body.icon.length > 16) return { error: "Invalid icon" };
    fields.icon = body.icon;
  }
  if (body.targetMinutes !== undefined) {
    const t = body.targetMinutes;
    if (!Number.isInteger(t) || t < 0 || t > 600) return { error: "Pick a daily target between 0 and 600 minutes" };
    fields.targetMinutes = t;
  }
  if (body.days !== undefined) {
    if (!Array.isArray(body.days) || !body.days.every((d) => ALL_DAYS.includes(d))) return { error: "Invalid days" };
    const days = [...new Set(body.days)].sort();
    if (!days.length) return { error: "Pick at least one day" };
    fields.days = days;
  }
  return { fields };
};

// Today's state, the last 7 days, the current and best streak, and lifetime totals for one habit.
const summarize = (habit, logs, today) => {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const start = habit.startDate || today;
  const due = (date) => date >= start && habit.days.includes(weekday(date));
  const doneOn = (date) => Boolean(byDate.get(date)?.done);

  const week = Array.from({ length: WEEK }, (_, i) => {
    const date = addDays(today, i - (WEEK - 1));
    const log = byDate.get(date);
    return { date, due: due(date), done: Boolean(log?.done), minutes: log?.minutes || 0 };
  });

  const earliest = logs.reduce((min, l) => (l.date < min ? l.date : min), today);

  // A due day left undone breaks the streak, except today, which isn't over yet.
  let streak = 0;
  for (let date = today; date >= earliest; date = addDays(date, -1)) {
    if (doneOn(date)) streak += 1;
    else if (due(date) && date !== today) break;
  }

  let best = 0;
  let run = 0;
  for (let date = earliest; date <= today; date = addDays(date, 1)) {
    if (doneOn(date)) run += 1;
    else if (due(date) && date !== today) run = 0;
    best = Math.max(best, run);
  }

  const todayLog = byDate.get(today);
  return {
    ...habit.toJSON(),
    today: { date: today, due: due(today), done: Boolean(todayLog?.done), minutes: todayLog?.minutes || 0 },
    week,
    streak,
    best,
    totalMinutes: logs.reduce((sum, l) => sum + (l.minutes || 0), 0),
    totalDone: logs.filter((l) => l.done).length,
  };
};

const logsFor = (userId, habitIds) =>
  HabitLog.find({ user: userId, habit: { $in: habitIds } }).select("habit date done minutes").lean();

const findOwnHabit = (req) =>
  mongoose.isValidObjectId(req.params.id) ? Habit.findOne({ _id: req.params.id, user: req.userId }) : null;

const summarizeOne = async (habit, today) => summarize(habit, await logsFor(habit.user, [habit._id]), today);

// GET /api/habits?today=YYYY-MM-DD
const listHabits = async (req, res) => {
  const today = readToday(req.query.today);
  const habits = await Habit.find({ user: req.userId }).sort({ createdAt: 1 });
  const logs = await logsFor(req.userId, habits.map((h) => h._id));
  const byHabit = new Map();
  logs.forEach((l) => {
    const key = String(l.habit);
    if (!byHabit.has(key)) byHabit.set(key, []);
    byHabit.get(key).push(l);
  });
  res.json({ today, habits: habits.map((h) => summarize(h, byHabit.get(String(h._id)) || [], today)) });
};

// POST /api/habits  { title, icon?, targetMinutes?, days?, today? }
const createHabit = async (req, res) => {
  const { fields, error } = readFields(req.body, { requireTitle: true });
  if (error) return res.status(400).json({ message: error });
  const today = readToday(req.body.today);
  const habit = await Habit.create({ ...fields, startDate: today, user: req.userId });
  res.status(201).json({ habit: summarize(habit, [], today) });
};

// PATCH /api/habits/:id
const updateHabit = async (req, res) => {
  const { fields, error } = readFields(req.body, { requireTitle: false });
  if (error) return res.status(400).json({ message: error });
  const habit = await findOwnHabit(req);
  if (!habit) return res.status(404).json({ message: "Habit not found" });
  habit.set(fields);
  await habit.save();
  res.json({ habit: await summarizeOne(habit, readToday(req.body.today)) });
};

// DELETE /api/habits/:id — also removes its history.
const deleteHabit = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Habit not found" });
  const habit = await Habit.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!habit) return res.status(404).json({ message: "Habit not found" });
  await HabitLog.deleteMany({ habit: habit._id, user: req.userId });
  res.json({ id: habit._id });
};

// PUT /api/habits/:id/days/:date  { done?, addMinutes?, today }
// Ticks a day or adds time to it. Reaching the daily target ticks it automatically.
const logDay = async (req, res) => {
  const today = readToday(req.body.today);
  const { date } = req.params;
  if (!isDay(date) || date > today || date < addDays(today, -(EDITABLE_DAYS - 1))) {
    return res.status(400).json({ message: "You can only log the last 7 days" });
  }
  const { done, addMinutes } = req.body;
  if (done !== undefined && typeof done !== "boolean") return res.status(400).json({ message: "Invalid value" });
  if (addMinutes !== undefined && (!Number.isInteger(addMinutes) || Math.abs(addMinutes) > 1440)) {
    return res.status(400).json({ message: "Add between 1 and 1440 minutes" });
  }

  const habit = await findOwnHabit(req);
  if (!habit) return res.status(404).json({ message: "Habit not found" });

  const log = (await HabitLog.findOne({ habit: habit._id, date })) || new HabitLog({ user: req.userId, habit: habit._id, date });
  if (addMinutes) {
    log.minutes = Math.min(1440, Math.max(0, log.minutes + addMinutes));
    if (habit.targetMinutes && log.minutes >= habit.targetMinutes) log.done = true;
  }
  if (done !== undefined) log.done = done;

  if (!log.done && !log.minutes) {
    if (!log.isNew) await log.deleteOne();
  } else {
    await log.save();
  }
  res.json({ habit: await summarizeOne(habit, today) });
};

module.exports = { listHabits, createHabit, updateHabit, deleteHabit, logDay };
