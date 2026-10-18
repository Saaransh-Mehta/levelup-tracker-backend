const mongoose = require("mongoose");

// A major money task to get done: "Build a 3-month emergency fund", "Start a SIP".
const financeTaskSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    // Optional amount involved, in minor units.
    amount: { type: Number, default: null, min: 0 },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
  },
  { timestamps: true }
);

financeTaskSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("FinanceTask", financeTaskSchema);
