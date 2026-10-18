const express = require("express");
const { protect } = require("../middleware/auth");
const {
  getActive,
  getSession,
  updateSession,
  startFreeSession,
  listRecent,
} = require("../controllers/sessionController");

const router = express.Router();

router.use(protect);
router.get("/", listRecent);
router.post("/", startFreeSession);
router.get("/active", getActive);
router.get("/:id", getSession);
router.patch("/:id", updateSession);

module.exports = router;
