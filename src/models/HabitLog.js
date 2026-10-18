const mongoose = require("mongoose");

// One habit on one day. The date is the user's local calendar day ("2026-10-05"), so a late-night
// tick lands on the day the user sees, not the server's.
const habitLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    habit: { type: mongoose.Schema.Types.ObjectId, ref: "Habit", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    done: { type: Boolean, default: false },
    minutes: { type: Number, default: 0, min: 0, max: 1440 },
  },
  { timestamps: true }
);

habitLogSchema.index({ habit: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("HabitLog", habitLogSchema);
