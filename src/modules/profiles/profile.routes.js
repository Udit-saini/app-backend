const express = require("express");
const profileController = require("./profile.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/", authMiddleware, profileController.createProfile);
router.patch("/", authMiddleware, profileController.updateProfile);

module.exports = router;
