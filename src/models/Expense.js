const mongoose = require("mongoose");

const CATEGORIES = ["food", "transport", "shopping", "bills", "fun", "health", "education", "other"];

// One thing the user paid for. The date is the user's local calendar day.
const expenseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    item: { type: String, required: true, trim: true, maxlength: 120 },
    // In minor units (paise, cents).
    amount: { type: Number, required: true, min: 1 },
    category: { type: String, enum: CATEGORIES, default: "other" },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { timestamps: true }
);

expenseSchema.index({ user: 1, date: -1 });

expenseSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Expense", expenseSchema);
module.exports.CATEGORIES = CATEGORIES;
