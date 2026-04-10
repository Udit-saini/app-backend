const express = require("express");
const profileController = require("./profile.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/", authMiddleware, profileController.createProfile);

module.exports = router;
