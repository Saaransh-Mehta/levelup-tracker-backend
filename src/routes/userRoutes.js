const express = require("express");
const { protect } = require("../middleware/auth");
const { getMe, savePersonality, saveFocusApps } = require("../controllers/userController");

const router = express.Router();

router.get("/me", protect, getMe);
router.put("/personality", protect, savePersonality);
router.put("/focus-apps", protect, saveFocusApps);

module.exports = router;
