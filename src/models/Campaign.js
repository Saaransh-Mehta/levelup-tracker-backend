const mongoose = require("mongoose");

// A goal of the campaign. Ticked once, when it's reached.
const objectiveSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 200 },
  done: { type: Boolean, default: false },
});

// A distraction to stay away from, or a ritual done every day. It only counts from the day it was
// added, so adding one mid-campaign doesn't take back days already won.
const lineSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 200 },
  since: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
});

// A time-boxed push towards a few goals: daily rituals to do, distractions to avoid, and a to-do list
// per day. Dates are the user's local calendar days ("2026-10-06"), both ends included.
const campaignSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    icon: { type: String, default: "⚔️", maxlength: 16 },
    mission: { type: String, default: "", trim: true, maxlength: 500 },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    goals: { type: [objectiveSchema], default: [] },
    distractions: { type: [lineSchema], default: [] },
    rituals: { type: [lineSchema], default: [] },
  },
  { timestamps: true }
);

campaignSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Campaign", campaignSchema);
