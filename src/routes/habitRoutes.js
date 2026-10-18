const express = require("express");
const { protect } = require("../middleware/auth");
const { listHabits, createHabit, updateHabit, deleteHabit, logDay } = require("../controllers/habitController");

const router = express.Router();

router.use(protect);
router.get("/", listHabits);
router.post("/", createHabit);
router.patch("/:id", updateHabit);
router.delete("/:id", deleteHabit);
router.put("/:id/days/:date", logDay);

module.exports = router;
