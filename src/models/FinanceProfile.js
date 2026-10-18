const mongoose = require("mongoose");

const CURRENCIES = ["INR", "USD", "EUR", "GBP"];
const PERIODS = ["week", "month"];

// Asked the first time the user opens Finance, not at sign-up.
const financeProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    currency: { type: String, enum: CURRENCIES, default: "INR" },
    // The budget as the user set it, per week or per month, in minor units (paise, cents).
    // Both views come from the same daily allowance, so a week and a month always agree.
    budgetAmount: { type: Number, min: 0 },
    budgetPeriod: { type: String, enum: PERIODS, default: "week" },
    // Before monthly budgets existed. Read as a weekly budget when budgetAmount is missing.
    weeklyBudget: { type: Number, min: 0 },
  },
  { timestamps: true }
);

financeProfileSchema.set("toJSON", {
  transform: (doc, ret) => {
    if (ret.budgetAmount == null) {
      ret.budgetAmount = ret.weeklyBudget || 0;
      ret.budgetPeriod = "week";
    }
    delete ret.weeklyBudget;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("FinanceProfile", financeProfileSchema);
module.exports.CURRENCIES = CURRENCIES;
module.exports.PERIODS = PERIODS;
