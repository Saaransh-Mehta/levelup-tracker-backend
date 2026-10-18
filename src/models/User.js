const mongoose = require("mongoose");

const WORK_STYLES = ["short_sprints", "medium_blocks", "deep_work"];
const MOTIVATIONS = ["streaks_stats", "levelling_rewards", "accountability", "prove_myself"];
const BLOCKERS = ["procrastination", "losing_motivation", "too_many_things", "forgetting", "burnout"];

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, required: true, unique: true, trim: true },
    gender: { type: String, required: true, enum: ["male", "female", "other", "prefer_not_to_say"] },
    dateOfBirth: { type: Date, required: true },
    password: { type: String, required: true, select: false },
    personality: {
      workStyle: { type: String, enum: WORK_STYLES },
      motivation: { type: String, enum: MOTIVATIONS },
      blocker: { type: String, enum: BLOCKERS },
    },
    onboardingCompleted: { type: Boolean, default: false },
    // Up to two apps the user allows themselves during focus sessions.
    focusApps: {
      type: [{ _id: false, name: { type: String, trim: true, maxlength: 40 }, url: { type: String, trim: true, maxlength: 500 } }],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
module.exports.WORK_STYLES = WORK_STYLES;
module.exports.MOTIVATIONS = MOTIVATIONS;
module.exports.BLOCKERS = BLOCKERS;
