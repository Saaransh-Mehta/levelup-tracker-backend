const express = require("express");
const { protect } = require("../middleware/auth");
const { getMe, savePersonality, saveFocusApps, saveUsername, changePassword } = require("../controllers/userController");

const router = express.Router();

router.get("/me", protect, getMe);
router.put("/personality", protect, savePersonality);
router.put("/focus-apps", protect, saveFocusApps);
router.put("/username", protect, saveUsername);
router.put("/password", protect, changePassword);

module.exports = router;
