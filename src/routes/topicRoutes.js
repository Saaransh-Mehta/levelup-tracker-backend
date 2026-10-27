const express = require("express");
const { protect } = require("../middleware/auth");
const {
  listTopics,
  createTopic,
  getTopic,
  updateTopic,
  deleteTopic,
  addVideo,
  removeVideo,
  startStudySession,
} = require("../controllers/topicController");

const router = express.Router();

router.use(protect);
router.get("/", listTopics);
router.post("/", createTopic);
router.get("/:id", getTopic);
router.patch("/:id", updateTopic);
router.delete("/:id", deleteTopic);
router.post("/:id/videos", addVideo);
router.delete("/:id/videos/:videoId", removeVideo);
router.post("/:id/sessions", startStudySession);

module.exports = router;
