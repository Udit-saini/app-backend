const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const nearbyController = require("./nearby.controller");

const router = express.Router();

router.get("/feed", authMiddleware, nearbyController.getFeed);

module.exports = router;
