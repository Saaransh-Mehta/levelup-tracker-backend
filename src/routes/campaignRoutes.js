const express = require("express");
const { protect } = require("../middleware/auth");
const {
  listCampaigns, createCampaign, getCampaign, updateCampaign, deleteCampaign, saveDay, startTodoSession, setTodoDone,
} = require("../controllers/campaignController");

const router = express.Router();

router.use(protect);
router.get("/", listCampaigns);
router.post("/", createCampaign);
router.get("/:id", getCampaign);
router.patch("/:id", updateCampaign);
router.delete("/:id", deleteCampaign);
router.put("/:id/days/:date", saveDay);
router.post("/:id/days/:date/todos/:todoId/sessions", startTodoSession);
router.patch("/:id/days/:date/todos/:todoId", setTodoDone);

module.exports = router;
