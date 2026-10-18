const mongoose = require("mongoose");

// A repeating habit. Ticked off per day, with optional time logged against a daily target.
const habitSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    icon: { type: String, default: "🌱", maxlength: 16 },
    // Minutes a day that count as done. 0: no target, the habit is just ticked.
    targetMinutes: { type: Number, default: 0, min: 0, max: 600 },
    // Weekdays the habit is due, 0 = Sunday. Other days don't break a streak.
    days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    // The user's local day the habit was added. Days before it are never "missed".
    startDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { timestamps: true }
);

habitSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Habit", habitSchema);
