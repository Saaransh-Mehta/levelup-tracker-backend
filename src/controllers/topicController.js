const mongoose = require("mongoose");
const Topic = require("../models/Topic");
const { MAX_VIDEOS, MAX_VIDEO_NOTES } = require("../models/Topic");
const Session = require("../models/Session");
const { send, readMinutes, createSession, MINUTES_ERROR, statsByTopic } = require("./sessionController");

const MAX_CONTENT_BYTES = 500 * 1024;
const RECENT_SESSIONS = 10;
const YOUTUBE_HOSTS = ["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"];
const VIDEO_ID = /^[\w-]{11}$/;

// "90", "90s", "1m30s", "1h2m3s" → seconds. Anything else → 0.
const readStart = (value) => {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  return match ? (Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0) : 0;
};

// Pulls the video id and start time out of any common YouTube link. Null if it isn't one.
const parseYouTube = (input) => {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.includes(host)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  let videoId = null;
  if (host === "youtu.be") videoId = parts[0];
  else if (parts[0] === "watch") videoId = url.searchParams.get("v");
  else if (["shorts", "embed", "live", "v"].includes(parts[0])) videoId = parts[1];
  if (!videoId || !VIDEO_ID.test(videoId)) return null;

  return { videoId, start: readStart(url.searchParams.get("t") || url.searchParams.get("start")) };
};

// The video's title and channel from YouTube's oEmbed endpoint, which needs no API key.
// Returns null when YouTube says the video doesn't exist; a generic title if YouTube can't be reached.
const fetchVideoInfo = async (videoId) => {
  const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) return {};
    const data = await res.json();
    return {
      title: typeof data.title === "string" ? data.title.slice(0, 200) : undefined,
      channel: typeof data.author_name === "string" ? data.author_name.slice(0, 120) : undefined,
    };
  } catch {
    return {};
  }
};

// Validates the editable fields in a request body. Returns { fields } or { error }.
const readFields = (body, { requireTitle }) => {
  const fields = {};

  if (body.title !== undefined || requireTitle) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return { error: "Name the topic you're studying" };
    if (title.length > 120) return { error: "Topic name is too long" };
    fields.title = title;
  }
  if (body.icon !== undefined) {
    if (typeof body.icon !== "string" || !body.icon || body.icon.length > 16) return { error: "Invalid icon" };
    fields.icon = body.icon;
  }
  if (body.content !== undefined) {
    if (body.content !== null && (typeof body.content !== "object" || body.content.type !== "doc")) {
      return { error: "Invalid note content" };
    }
    if (JSON.stringify(body.content).length > MAX_CONTENT_BYTES) return { error: "Notes are too large" };
    fields.content = body.content;
  }
  return { fields };
};

const findOwnTopic = (req) =>
  mongoose.isValidObjectId(req.params.id) ? Topic.findOne({ _id: req.params.id, user: req.userId }) : null;

const NONE = { count: 0, seconds: 0, lastAt: null };

// GET /api/topics — summaries without the notes, with study totals. Most recently studied first.
const listTopics = async (req, res) => {
  const [topics, stats] = await Promise.all([
    Topic.find({ user: req.userId }).select("-content -videos.notes").sort({ updatedAt: -1 }),
    statsByTopic(req.userId),
  ]);
  const list = topics.map((t) => ({ ...t.toJSON(), sessions: stats.get(String(t._id)) || NONE }));
  const recency = (t) => Math.max(new Date(t.updatedAt), t.sessions.lastAt ? new Date(t.sessions.lastAt) : 0);
  list.sort((a, b) => recency(b) - recency(a));
  res.json({ topics: list });
};

// POST /api/topics  { title, icon? }
const createTopic = async (req, res) => {
  const { fields, error } = readFields(req.body, { requireTitle: true });
  if (error) return res.status(400).json({ message: error });
  const topic = await Topic.create({ ...fields, user: req.userId });
  res.status(201).json({ topic });
};

// GET /api/topics/:id — the topic with its notes and videos, recent study sessions and totals.
const getTopic = async (req, res) => {
  const topic = await findOwnTopic(req);
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  const [sessions, stats] = await Promise.all([
    Session.find({ user: req.userId, topic: topic._id, status: "completed" })
      .sort({ startedAt: -1 })
      .limit(RECENT_SESSIONS),
    statsByTopic(req.userId),
  ]);
  res.json({ topic, sessions, stats: stats.get(String(topic._id)) || NONE });
};

// PATCH /api/topics/:id  { title?, icon?, content? }
const updateTopic = async (req, res) => {
  const { fields, error } = readFields(req.body, { requireTitle: false });
  if (error) return res.status(400).json({ message: error });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Topic not found" });

  const topic = await Topic.findOneAndUpdate({ _id: req.params.id, user: req.userId }, fields, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  res.json({ topic });
};

// DELETE /api/topics/:id — also removes its study sessions.
const deleteTopic = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Topic not found" });
  const topic = await Topic.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  await Session.deleteMany({ topic: topic._id, user: req.userId });
  res.json({ id: topic._id });
};

// POST /api/topics/:id/videos  { url }
const addVideo = async (req, res) => {
  const link = typeof req.body.url === "string" ? req.body.url.trim() : "";
  const parsed = link.length <= 500 ? parseYouTube(link) : null;
  if (!parsed) return res.status(400).json({ message: "That doesn't look like a YouTube video link" });

  const topic = await findOwnTopic(req);
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  if (topic.videos.some((v) => v.videoId === parsed.videoId)) {
    return res.status(409).json({ message: "This video is already in the topic" });
  }
  if (topic.videos.length >= MAX_VIDEOS) {
    return res.status(400).json({ message: `A topic holds up to ${MAX_VIDEOS} videos` });
  }

  const info = await fetchVideoInfo(parsed.videoId);
  if (!info) return res.status(404).json({ message: "YouTube can't find that video. Check the link" });

  // Pushed atomically, so two links added at once both land.
  const updated = await Topic.findOneAndUpdate(
    { _id: topic._id, user: req.userId, "videos.videoId": { $ne: parsed.videoId } },
    { $push: { videos: { ...parsed, ...info } } },
    { returnDocument: "after", runValidators: true }
  );
  if (!updated) return res.status(409).json({ message: "This video is already in the topic" });
  res.status(201).json({ topic: updated, video: updated.videos[updated.videos.length - 1] });
};

// DELETE /api/topics/:id/videos/:videoId (the saved entry's _id)
const removeVideo = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.videoId)) {
    return res.status(404).json({ message: "Video not found" });
  }
  const topic = await Topic.findOneAndUpdate(
    { _id: req.params.id, user: req.userId },
    { $pull: { videos: { _id: req.params.videoId } } },
    { returnDocument: "after" }
  );
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  res.json({ topic });
};

// Validates a timestamped note. Returns { fields } or { error }.
const readVideoNote = (body, { partial }) => {
  const fields = {};
  if (body.at !== undefined || !partial) {
    const at = Number(body.at);
    if (!Number.isFinite(at) || at < 0 || at > 24 * 60 * 60) return { error: "Invalid time" };
    fields.at = Math.floor(at);
  }
  if (body.text !== undefined || !partial) {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return { error: "Write something for this moment" };
    if (text.length > 2000) return { error: "Keep the note under 2000 characters" };
    fields.text = text;
  }
  return { fields };
};

const validIds = (...ids) => ids.every((id) => mongoose.isValidObjectId(id));
const videoOf = (topic, videoId) => topic?.videos.id(videoId) || null;

// POST /api/topics/:id/videos/:videoId/notes  { at, text } — returns the video with its notes.
const addVideoNote = async (req, res) => {
  const { id, videoId } = req.params;
  if (!validIds(id, videoId)) return res.status(404).json({ message: "Video not found" });
  const { fields, error } = readVideoNote(req.body, { partial: false });
  if (error) return res.status(400).json({ message: error });

  const topic = await Topic.findOneAndUpdate(
    {
      _id: id,
      user: req.userId,
      videos: { $elemMatch: { _id: videoId, [`notes.${MAX_VIDEO_NOTES - 1}`]: { $exists: false } } },
    },
    { $push: { "videos.$.notes": fields } },
    { returnDocument: "after", runValidators: true }
  );
  if (!topic) {
    const exists = await Topic.exists({ _id: id, user: req.userId, "videos._id": videoId });
    return exists
      ? res.status(400).json({ message: `A video holds up to ${MAX_VIDEO_NOTES} notes` })
      : res.status(404).json({ message: "Video not found" });
  }
  const video = videoOf(topic, videoId);
  res.status(201).json({ video, note: video.notes[video.notes.length - 1] });
};

// PATCH /api/topics/:id/videos/:videoId/notes/:noteId  { at?, text? }
const updateVideoNote = async (req, res) => {
  const { id, videoId, noteId } = req.params;
  if (!validIds(id, videoId, noteId)) return res.status(404).json({ message: "Note not found" });
  const { fields, error } = readVideoNote(req.body, { partial: true });
  if (error) return res.status(400).json({ message: error });

  const set = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`videos.$[v].notes.$[n].${k}`, v]));
  const topic = await Topic.findOneAndUpdate(
    { _id: id, user: req.userId, "videos._id": videoId },
    { $set: set },
    { arrayFilters: [{ "v._id": videoId }, { "n._id": noteId }], returnDocument: "after", runValidators: true }
  );
  const video = videoOf(topic, videoId);
  if (!video?.notes.id(noteId)) return res.status(404).json({ message: "Note not found" });
  res.json({ video });
};

// DELETE /api/topics/:id/videos/:videoId/notes/:noteId
const removeVideoNote = async (req, res) => {
  const { id, videoId, noteId } = req.params;
  if (!validIds(id, videoId, noteId)) return res.status(404).json({ message: "Note not found" });
  const topic = await Topic.findOneAndUpdate(
    { _id: id, user: req.userId, "videos._id": videoId },
    { $pull: { "videos.$.notes": { _id: noteId } } },
    { returnDocument: "after" }
  );
  const video = videoOf(topic, videoId);
  if (!video) return res.status(404).json({ message: "Video not found" });
  res.json({ video });
};

// POST /api/topics/:id/sessions  { minutes } — a study session on this topic.
const startStudySession = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return send(res, 404, { message: "Topic not found" });
  const topic = await Topic.findOne({ _id: req.params.id, user: req.userId }).select("title");
  if (!topic) return send(res, 404, { message: "Topic not found" });
  const minutes = readMinutes(req.body);
  if (!minutes) return send(res, 400, { message: MINUTES_ERROR });
  send(res, ...(await createSession(req.userId, { topic: topic._id, label: topic.title.slice(0, 80), minutes })));
};

module.exports = {
  parseYouTube,
  listTopics,
  createTopic,
  getTopic,
  updateTopic,
  deleteTopic,
  addVideo,
  removeVideo,
  addVideoNote,
  updateVideoNote,
  removeVideoNote,
  startStudySession,
};
