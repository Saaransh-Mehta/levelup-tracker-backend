const express = require("express");
const { protect } = require("../middleware/auth");
const {
  getRange, saveProfile, addExpense, updateExpense, deleteExpense, addTask, updateTask, deleteTask,
} = require("../controllers/financeController");

const router = express.Router();

router.use(protect);
router.get("/", getRange);
router.put("/profile", saveProfile);
router.post("/expenses", addExpense);
router.patch("/expenses/:id", updateExpense);
router.delete("/expenses/:id", deleteExpense);
router.post("/checklist", addTask);
router.patch("/checklist/:id", updateTask);
router.delete("/checklist/:id", deleteTask);

module.exports = router;
