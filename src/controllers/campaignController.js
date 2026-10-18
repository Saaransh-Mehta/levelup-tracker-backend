const mongoose = require("mongoose");
const Campaign = require("../models/Campaign");
const CampaignDay = require("../models/CampaignDay");
const { send, readMinutes, createSession, MINUTES_ERROR, secondsByTodo } = require("./sessionController");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 365;
const MAX_ITEMS = 20;
const MAX_TODOS = 30;

// Calendar-day helpers on "YYYY-MM-DD" strings. UTC is used only as a neutral calendar.
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const formatDay = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
};
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
const isDay = (s) => typeof s === "string" && DATE_RE.test(s) && !isNaN(parseDay(s));

// The client sends its own "today" so days follow the user's timezone.
const readToday = (value) => (isDay(value) ? value : formatDay(new Date()));

// Validates a list of { _id?, text, done? } rows. Existing ids are kept so day logs still match.
const readList = (value, { label, max, withDone }) => {
  if (!Array.isArray(value)) return { error: `Invalid ${label}` };
  if (value.length > max) return { error: `Up to ${max} ${label}` };
  const list = [];
  for (const row of value) {
    const text = typeof row?.text === "string" ? row.text.trim() : "";
    if (!text) continue;
    if (text.length > 200) return { error: `One of your ${label} is too long` };
    const item = { text };
    if (row._id !== undefined) {
      if (!mongoose.isValidObjectId(row._id)) return { error: `Invalid ${label}` };
      item._id = row._id;
    }
    if (withDone) item.done = row.done === true;
    list.push(item);
  }
  return { list };
};

// Validates the editable fields in a request body. Returns { fields } or { error }.
const readFields = (body, { creating }) => {
  const fields = {};

  if (body.name !== undefined || creating) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Give your campaign a name" };
    if (name.length > 120) return { error: "Campaign name is too long" };
    fields.name = name;
  }
  if (body.icon !== undefined) {
    if (typeof body.icon !== "string" || !body.icon || body.icon.length > 16) return { error: "Invalid icon" };
    fields.icon = body.icon;
  }
  if (body.mission !== undefined) {
    if (typeof body.mission !== "string" || body.mission.length > 500) return { error: "Mission is too long" };
    fields.mission = body.mission.trim();
  }
  for (const key of ["startDate", "endDate"]) {
    if (body[key] !== undefined || creating) {
      if (!isDay(body[key])) return { error: "Pick the campaign's dates" };
      fields[key] = body[key];
    }
  }
  const lists = [
    ["goals", { label: "goals", max: MAX_ITEMS, withDone: true }],
    ["distractions", { label: "distractions", max: MAX_ITEMS }],
    ["rituals", { label: "daily actions", max: MAX_ITEMS }],
  ];
  for (const [key, options] of lists) {
    if (body[key] === undefined) continue;
    const { list, error } = readList(body[key], options);
    if (error) return { error };
    fields[key] = list;
  }
  return { fields };
};

// Stamps the day each ritual or distraction starts counting: kept for ones already there, today for
// new ones (never before the campaign starts).
const stampSince = (fields, existing, today) => {
  const start = fields.startDate || existing?.startDate;
  for (const key of ["distractions", "rituals"]) {
    if (!fields[key]) continue;
    const known = new Map((existing?.[key] || []).map((item) => [String(item._id), item.since]));
    fields[key] = fields[key].map((item) => {
      const since = (item._id && known.get(String(item._id))) || (existing ? today : start);
      return { ...item, since: since < start ? start : since };
    });
  }
};

const checkDates = ({ startDate, endDate }) => {
  if (endDate < startDate) return "The campaign has to end after it starts";
  if (daysBetween(startDate, endDate) + 1 > MAX_DAYS) return `A campaign can run up to ${MAX_DAYS} days`;
  return null;
};

// One day's score. Rituals and to-dos count when done, distractions when resisted. A day nobody
// opened scores nothing, so resisting only counts on days that were logged. A day is won when every
// ritual and to-do is done and no distraction got through.
const scoreDay = (campaign, date, log) => {
  const counts = (item) => (item.since || campaign.startDate) <= date;
  const ritualIds = new Set(campaign.rituals.filter(counts).map((r) => String(r._id)));
  const distractionIds = new Set(campaign.distractions.filter(counts).map((d) => String(d._id)));
  const rituals = (log?.rituals || []).map(String).filter((id) => ritualIds.has(id));
  const slips = (log?.slips || []).map(String).filter((id) => distractionIds.has(id));
  const todos = (log?.todos || []).map((t) => ({ _id: t._id, text: t.text, done: t.done }));
  const todosDone = todos.filter((t) => t.done).length;

  const tasks = ritualIds.size + todos.length;
  const total = tasks + (log ? distractionIds.size : 0);
  const earned = rituals.length + todosDone + (log ? distractionIds.size - slips.length : 0);

  return {
    date,
    rituals,
    slips,
    todos,
    score: total ? earned / total : 0,
    won: Boolean(log) && tasks > 0 && rituals.length === ritualIds.size && todosDone === todos.length && !slips.length,
  };
};

// Where the campaign stands on the user's today: day number, streaks and wins so far.
const summarize = (campaign, logs, today) => {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const { startDate, endDate } = campaign;
  const totalDays = daysBetween(startDate, endDate) + 1;
  const status = today < startDate ? "upcoming" : today > endDate ? "complete" : "active";
  const lastDay = status === "complete" ? endDate : today;
  const elapsed = status === "upcoming" ? 0 : daysBetween(startDate, lastDay) + 1;

  const won = (date) => scoreDay(campaign, date, byDate.get(date)).won;

  // Today isn't over yet, so an unfinished today doesn't break the streak.
  let streak = 0;
  if (elapsed) {
    let date = lastDay;
    if (status === "active" && !won(date)) date = addDays(date, -1);
    for (; date >= startDate && won(date); date = addDays(date, -1)) streak += 1;
  }

  let wins = 0;
  let best = 0;
  let run = 0;
  for (let i = 0; i < elapsed; i += 1) {
    if (won(addDays(startDate, i))) {
      wins += 1;
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  return {
    ...campaign.toJSON(),
    status,
    totalDays,
    dayNumber: status === "active" ? elapsed : null,
    elapsed,
    daysLeft: status === "complete" ? 0 : daysBetween(today, endDate) + (status === "upcoming" ? 1 : 0),
    streak,
    best,
    wins,
    today: status === "active" ? scoreDay(campaign, today, byDate.get(today)) : null,
  };
};

const logsFor = (userId, campaignIds) =>
  CampaignDay.find({ user: userId, campaign: { $in: campaignIds } }).select("campaign date rituals slips todos").lean();

const findOwnCampaign = (req) =>
  mongoose.isValidObjectId(req.params.id) ? Campaign.findOne({ _id: req.params.id, user: req.userId }) : null;

// The whole campaign with every logged day scored, for the campaign page, plus seconds focused on
// each to-do.
const detail = async (campaign, today) => {
  const [logs, focus] = await Promise.all([
    logsFor(campaign.user, [campaign._id]),
    secondsByTodo(campaign.user, campaign._id),
  ]);
  return {
    campaign: summarize(campaign, logs, today),
    days: logs.map((l) => scoreDay(campaign, l.date, l)),
    focus,
  };
};

// GET /api/campaigns?today=YYYY-MM-DD
const listCampaigns = async (req, res) => {
  const today = readToday(req.query.today);
  const campaigns = await Campaign.find({ user: req.userId }).sort({ startDate: -1, createdAt: -1 });
  const logs = await logsFor(req.userId, campaigns.map((c) => c._id));
  const byCampaign = new Map();
  logs.forEach((l) => {
    const key = String(l.campaign);
    if (!byCampaign.has(key)) byCampaign.set(key, []);
    byCampaign.get(key).push(l);
  });
  res.json({ today, campaigns: campaigns.map((c) => summarize(c, byCampaign.get(String(c._id)) || [], today)) });
};

// POST /api/campaigns  { name, icon?, mission?, startDate, endDate, goals?, distractions?, rituals?, today? }
const createCampaign = async (req, res) => {
  const { fields, error } = readFields(req.body, { creating: true });
  if (error) return res.status(400).json({ message: error });
  const dateError = checkDates(fields);
  if (dateError) return res.status(400).json({ message: dateError });
  stampSince(fields, null);
  const campaign = await Campaign.create({ ...fields, user: req.userId });
  res.status(201).json(await detail(campaign, readToday(req.body.today)));
};

// GET /api/campaigns/:id?today=YYYY-MM-DD
const getCampaign = async (req, res) => {
  const campaign = await findOwnCampaign(req);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  res.json(await detail(campaign, readToday(req.query.today)));
};

// PATCH /api/campaigns/:id — lists are sent whole and replace the stored ones.
const updateCampaign = async (req, res) => {
  const { fields, error } = readFields(req.body, { creating: false });
  if (error) return res.status(400).json({ message: error });
  const campaign = await findOwnCampaign(req);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  const today = readToday(req.body.today);
  stampSince(fields, campaign, today);
  campaign.set(fields);
  const dateError = checkDates(campaign);
  if (dateError) return res.status(400).json({ message: dateError });
  await campaign.save();
  res.json(await detail(campaign, today));
};

// DELETE /api/campaigns/:id — also removes its days.
const deleteCampaign = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Campaign not found" });
  const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  await CampaignDay.deleteMany({ campaign: campaign._id, user: req.userId });
  res.json({ id: campaign._id });
};

// PUT /api/campaigns/:id/days/:date  { rituals?, slips?, todos?, today }
// Each list sent replaces that day's. To-dos can be planned ahead; rituals and slips only up to today.
const saveDay = async (req, res) => {
  const today = readToday(req.body.today);
  const { date } = req.params;
  const campaign = await findOwnCampaign(req);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  if (!isDay(date) || date < campaign.startDate || date > campaign.endDate) {
    return res.status(400).json({ message: "That day is outside the campaign" });
  }

  const update = {};
  for (const [key, source] of [["rituals", campaign.rituals], ["slips", campaign.distractions]]) {
    const value = req.body[key];
    if (value === undefined) continue;
    if (date > today) return res.status(400).json({ message: "That day hasn't happened yet" });
    const known = new Set(source.map((item) => String(item._id)));
    if (!Array.isArray(value) || !value.every((id) => known.has(String(id)))) {
      return res.status(400).json({ message: "Invalid value" });
    }
    update[key] = [...new Set(value.map(String))];
  }
  if (req.body.todos !== undefined) {
    const { list, error } = readList(req.body.todos, { label: "to-dos", max: MAX_TODOS, withDone: true });
    if (error) return res.status(400).json({ message: error });
    update.todos = list;
  }

  const log = (await CampaignDay.findOne({ campaign: campaign._id, date }))
    || new CampaignDay({ user: req.userId, campaign: campaign._id, date });
  log.set(update);
  if (!log.rituals.length && !log.slips.length && !log.todos.length) {
    if (!log.isNew) await log.deleteOne();
  } else {
    await log.save();
  }

  const logs = await logsFor(req.userId, [campaign._id]);
  const saved = logs.find((l) => l.date === date);
  res.json({ campaign: summarize(campaign, logs, today), day: scoreDay(campaign, date, saved) });
};

// Finds one to-do of one campaign day. Returns { campaign, log, todo } or { error, status }.
const findTodo = async (req) => {
  const campaign = await findOwnCampaign(req);
  if (!campaign) return { status: 404, error: "Campaign not found" };
  const { date, todoId } = req.params;
  const log = isDay(date) && mongoose.isValidObjectId(todoId)
    ? await CampaignDay.findOne({ campaign: campaign._id, date })
    : null;
  const todo = log?.todos.id(todoId);
  if (!todo) return { status: 404, error: "To-do not found" };
  return { campaign, log, todo };
};

// POST /api/campaigns/:id/days/:date/todos/:todoId/sessions  { minutes, today }
// Starts a focus session on a to-do. Its time shows on the to-do once the session completes.
const startTodoSession = async (req, res) => {
  const { campaign, todo, error, status } = await findTodo(req);
  if (error) return send(res, status, { message: error });
  if (req.params.date > readToday(req.body.today)) {
    return send(res, 400, { message: "That day hasn't happened yet" });
  }
  const minutes = readMinutes(req.body);
  if (!minutes) return send(res, 400, { message: MINUTES_ERROR });
  send(res, ...(await createSession(req.userId, {
    label: todo.text.slice(0, 80),
    minutes,
    todo: { campaign: campaign._id, date: req.params.date, _id: todo._id },
  })));
};

// PATCH /api/campaigns/:id/days/:date/todos/:todoId  { done } — ticks one to-do, from the focus screen.
const setTodoDone = async (req, res) => {
  if (typeof req.body.done !== "boolean") return res.status(400).json({ message: "Invalid value" });
  const { log, todo, error, status } = await findTodo(req);
  if (error) return res.status(status).json({ message: error });
  todo.done = req.body.done;
  await log.save();
  res.json({ todo: { _id: todo._id, text: todo.text, done: todo.done } });
};

module.exports = {
  listCampaigns, createCampaign, getCampaign, updateCampaign, deleteCampaign, saveDay, startTodoSession, setTodoDone,
};
