const mongoose = require("mongoose");

const MAX_VIDEOS = 50;

// A YouTube video saved to a topic. The title comes from YouTube when the link is added.
const videoSchema = new mongoose.Schema(
  {
    videoId: { type: String, required: true, match: /^[\w-]{11}$/ },
    // Where to start playing, from a "t=" in the pasted link.
    start: { type: Number, default: 0, min: 0 },
    title: { type: String, trim: true, maxlength: 200, default: "YouTube video" },
    channel: { type: String, trim: true, maxlength: 120, default: "" },
  },
  { timestamps: { createdAt: "addedAt", updatedAt: false } }
);

// Something the user studies: one running note plus the videos they learn it from.
// Study sessions on the topic add to its time and edit the same note.
const topicSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    icon: { type: String, default: "📚", maxlength: 16 },
    // The topic's notes, stored as the editor's JSON document.
    content: { type: mongoose.Schema.Types.Mixed, default: null },
    videos: { type: [videoSchema], default: [] },
  },
  { timestamps: true }
);

topicSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Topic", topicSchema);
module.exports.MAX_VIDEOS = MAX_VIDEOS;
