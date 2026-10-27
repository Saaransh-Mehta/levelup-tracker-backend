const mongoose = require("mongoose");

const STATUSES = ["running", "paused", "completed", "abandoned"];

// A focus session, on a goal or free-standing. Time is tracked on the server so a reload or a locked
// phone never loses it: focused time = accumulatedSeconds + time since resumedAt.
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Null for a free session that isn't tied to a goal.
    goal: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", default: null, index: true },
    // What a free session is about, e.g. "Deep work". Optional. For a campaign to-do, its text.
    label: { type: String, trim: true, maxlength: 80, default: "" },
    // Set when the session is spent on one of a campaign day's to-dos.
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null, index: true },
    campaignDate: { type: String, default: null },
    todo: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Set for a study session; its notes go into the topic's note instead of this session's.
    topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", default: null, index: true },
    plannedSeconds: { type: Number, required: true, min: 60, max: 4 * 60 * 60 },
    status: { type: String, enum: STATUSES, default: "running" },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    accumulatedSeconds: { type: Number, default: 0 },
    resumedAt: { type: Date, default: null },
    // Times the user left the app during the session, other than through an allowed app.
    distractions: { type: Number, default: 0 },
    notes: { type: String, default: "", maxlength: 20000 },
  },
  { timestamps: true }
);

sessionSchema.methods.focusedSeconds = function (now = new Date()) {
  const running = this.resumedAt ? (now - this.resumedAt) / 1000 : 0;
  return Math.min(this.plannedSeconds, Math.floor(this.accumulatedSeconds + running));
};

// Stops the clock and closes the session. Sessions under a minute aren't counted.
sessionSchema.methods.close = function (now = new Date()) {
  this.accumulatedSeconds = this.focusedSeconds(now);
  this.resumedAt = null;
  this.endedAt = now;
  this.status = this.accumulatedSeconds >= 60 ? "completed" : "abandoned";
};

sessionSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.focusedSeconds = doc.focusedSeconds();
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Session", sessionSchema);
module.exports.STATUSES = STATUSES;
