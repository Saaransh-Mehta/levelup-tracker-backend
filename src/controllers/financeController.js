const mongoose = require("mongoose");
const FinanceProfile = require("../models/FinanceProfile");
const { CURRENCIES, PERIODS } = require("../models/FinanceProfile");
const Expense = require("../models/Expense");
const { CATEGORIES } = require("../models/Expense");
const FinanceTask = require("../models/FinanceTask");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Amounts are in minor units; this caps a single value at 10 crore / 100 million.
const MAX_AMOUNT = 10_000_000_000;

// Calendar-day helpers on "YYYY-MM-DD" strings. UTC is used only as a neutral calendar.
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const isDay = (s) => typeof s === "string" && DATE_RE.test(s) && !isNaN(parseDay(s));
const addDays = (s, n) => {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const daysInMonth = (s) => {
  const d = parseDay(s);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};
const monthStart = (s) => `${s.slice(0, 7)}-01`;
const monthEnd = (s) => `${s.slice(0, 7)}-${String(daysInMonth(s)).padStart(2, "0")}`;
const minDay = (a, b) => (a < b ? a : b);
const maxDay = (a, b) => (a > b ? a : b);

// A week runs Monday to Sunday; a month is its calendar month.
const rangeOf = (period, start) =>
  period === "month" ? { start: monthStart(start), end: monthEnd(start) } : { start, end: addDays(start, 6) };
const previousRange = (period, range) =>
  period === "month" ? rangeOf("month", addDays(range.start, -1)) : rangeOf("week", addDays(range.start, -7));

// The allowance for one day. A weekly budget spreads over 7 days, a monthly one over that month's days,
// so the budget for any range (a week, a month, a week split across two months) is the sum of its days.
const dailyBudget = (profile, day) => {
  const { budgetAmount, budgetPeriod } = profile.toJSON();
  return budgetPeriod === "month" ? budgetAmount / daysInMonth(day) : budgetAmount / 7;
};
const budgetFor = (profile, { start, end }) => {
  if (!profile) return 0;
  let sum = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) sum += dailyBudget(profile, d);
  // Whole currency units: a derived budget of 1,935.48 reads as 1,935.
  return Math.round(sum / 100) * 100;
};

const isAmount = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT;

const findOwn = (Model, req) =>
  mongoose.isValidObjectId(req.params.id) ? Model.findOne({ _id: req.params.id, user: req.userId }) : null;

const totalFor = async (userId, { start, end }) => {
  const [row] = await Expense.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return row?.total || 0;
};

// GET /api/finance?period=week|month&start=YYYY-MM-DD&today=YYYY-MM-DD
// The budget, spending and checklist for one week or month, plus the period before it. A week view
// also carries its month so far, so the two stay visibly in step. The client picks the dates, so
// weeks and months follow the user's timezone.
const getRange = async (req, res) => {
  const period = req.query.period || "week";
  const { start, today } = req.query;
  if (!PERIODS.includes(period) || !isDay(start) || !isDay(today)) return res.status(400).json({ message: "Invalid dates" });
  const range = rangeOf(period, start);
  const prev = previousRange(period, range);
  // The month a week view links to: the one holding today if it's this week, otherwise the week's start.
  const monthDay = today >= range.start && today <= range.end ? today : range.start;
  const month = period === "week" ? rangeOf("month", monthDay) : null;

  const [profile, expenses, previousTotal, monthTotal, checklist] = await Promise.all([
    FinanceProfile.findOne({ user: req.userId }),
    Expense.find({ user: req.userId, date: { $gte: range.start, $lte: range.end } }).sort({ date: -1, createdAt: -1 }),
    totalFor(req.userId, prev),
    month ? totalFor(req.userId, month) : 0,
    FinanceTask.find({ user: req.userId }).sort({ createdAt: 1 }),
  ]);

  res.json({
    profile,
    period,
    range,
    budget: budgetFor(profile, range),
    expenses,
    total: expenses.reduce((sum, e) => sum + e.amount, 0),
    previous: { ...prev, total: previousTotal, budget: budgetFor(profile, prev) },
    month: month && { ...month, total: monthTotal, budget: budgetFor(profile, month) },
    checklist,
  });
};

// PUT /api/finance/profile  { amount, period, currency? }
const saveProfile = async (req, res) => {
  const { amount, period, currency } = req.body;
  if (!isAmount(amount) || amount === 0) return res.status(400).json({ message: "Set a budget above zero" });
  if (!PERIODS.includes(period)) return res.status(400).json({ message: "Pick weekly or monthly" });
  if (currency !== undefined && !CURRENCIES.includes(currency)) return res.status(400).json({ message: "Pick a currency" });

  const update = { $set: { budgetAmount: amount, budgetPeriod: period }, $unset: { weeklyBudget: 1 } };
  if (currency) update.$set.currency = currency;
  const profile = await FinanceProfile.findOneAndUpdate({ user: req.userId }, update, {
    new: true,
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  });
  res.json({ profile });
};

// Validates expense fields. Returns { fields } or { error }.
const readExpense = (body, { partial }) => {
  const fields = {};
  if (body.item !== undefined || !partial) {
    const item = typeof body.item === "string" ? body.item.trim() : "";
    if (!item) return { error: "What did you spend on?" };
    if (item.length > 120) return { error: "Keep the item under 120 characters" };
    fields.item = item;
  }
  if (body.amount !== undefined || !partial) {
    if (!isAmount(body.amount) || body.amount === 0) return { error: "Enter an amount above zero" };
    fields.amount = body.amount;
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) return { error: "Pick a category" };
    fields.category = body.category;
  }
  if (body.date !== undefined || !partial) {
    if (!isDay(body.date)) return { error: "Pick a valid date" };
    fields.date = body.date;
  }
  return { fields };
};

// POST /api/finance/expenses  { item, amount, category?, date }
const addExpense = async (req, res) => {
  const { fields, error } = readExpense(req.body, { partial: false });
  if (error) return res.status(400).json({ message: error });
  const expense = await Expense.create({ ...fields, user: req.userId });
  res.status(201).json({ expense });
};

// PATCH /api/finance/expenses/:id
const updateExpense = async (req, res) => {
  const { fields, error } = readExpense(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });
  const expense = await findOwn(Expense, req);
  if (!expense) return res.status(404).json({ message: "Expense not found" });
  expense.set(fields);
  await expense.save();
  res.json({ expense });
};

// DELETE /api/finance/expenses/:id
const deleteExpense = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Expense not found" });
  const expense = await Expense.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!expense) return res.status(404).json({ message: "Expense not found" });
  res.json({ id: expense._id });
};

// Validates checklist fields. Returns { fields } or { error }.
const readTask = (body, { partial }) => {
  const fields = {};
  if (body.title !== undefined || !partial) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return { error: "Name the task" };
    if (title.length > 160) return { error: "Keep the task under 160 characters" };
    fields.title = title;
  }
  if (body.amount !== undefined) {
    if (body.amount !== null && !isAmount(body.amount)) return { error: "Invalid amount" };
    fields.amount = body.amount || null;
  }
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean") return { error: "Invalid value" };
    fields.done = body.done;
    fields.doneAt = body.done ? new Date() : null;
  }
  return { fields };
};

// POST /api/finance/checklist  { title, amount? }
const addTask = async (req, res) => {
  const { fields, error } = readTask(req.body, { partial: false });
  if (error) return res.status(400).json({ message: error });
  const task = await FinanceTask.create({ ...fields, user: req.userId });
  res.status(201).json({ task });
};

// PATCH /api/finance/checklist/:id  { title?, amount?, done? }
const updateTask = async (req, res) => {
  const { fields, error } = readTask(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });
  const task = await findOwn(FinanceTask, req);
  if (!task) return res.status(404).json({ message: "Task not found" });
  task.set(fields);
  await task.save();
  res.json({ task });
};

// DELETE /api/finance/checklist/:id
const deleteTask = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Task not found" });
  const task = await FinanceTask.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!task) return res.status(404).json({ message: "Task not found" });
  res.json({ id: task._id });
};

module.exports = { getRange, saveProfile, addExpense, updateExpense, deleteExpense, addTask, updateTask, deleteTask };
