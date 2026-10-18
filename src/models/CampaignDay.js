const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 200 },
  done: { type: Boolean, default: false },
});

// One day of a campaign: which rituals were done, which distractions won, and that day's to-dos.
const campaignDaySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    // Ids of the campaign's rituals ticked off and distractions given in to on this day.
    rituals: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    slips: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    todos: { type: [todoSchema], default: [] },
  },
  { timestamps: true }
);

campaignDaySchema.index({ campaign: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("CampaignDay", campaignDaySchema);
