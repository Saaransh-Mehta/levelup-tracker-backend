const express = require("express");
const { protect } = require("../middleware/auth");
const { listGoals, createGoal, getGoal, updateGoal, deleteGoal } = require("../controllers/goalController");
const { startSession, listGoalSessions } = require("../controllers/sessionController");

const router = express.Router();

router.use(protect);
router.get("/", listGoals);
router.post("/", createGoal);
router.get("/:id", getGoal);
router.patch("/:id", updateGoal);
router.delete("/:id", deleteGoal);
router.get("/:id/sessions", listGoalSessions);
router.post("/:id/sessions", startSession);

module.exports = router;
