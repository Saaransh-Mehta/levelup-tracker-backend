const mongoose = require("mongoose");

const AREAS = ["fitness", "learning", "career", "mindfulness", "finance", "health", "creativity", "relationships"];
const STATUSES = ["active", "paused", "done"];

const goalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    icon: { type: String, default: "🎯", maxlength: 16 },
    area: { type: String, enum: AREAS },
    why: { type: String, trim: true, maxlength: 2000, default: "" },
    targetDate: { type: Date, default: null },
    status: { type: String, enum: STATUSES, default: "active" },
    // The goal's note, stored as the editor's JSON document.
    content: { type: mongoose.Schema.Types.Mixed, default: null },
    // Counted from the to-do items in the note on every save.
    progress: {
      done: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

goalSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Goal", goalSchema);
module.exports.AREAS = AREAS;
module.exports.STATUSES = STATUSES;
