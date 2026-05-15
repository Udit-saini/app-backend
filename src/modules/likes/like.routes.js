const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const likeController = require("./like.controller");
const { requirePremium } = require("../subscriptions/subscription.middleware");

const router = express.Router();

router.post("/action", authMiddleware, likeController.recordAction);
router.get("/received", authMiddleware, requirePremium, likeController.getReceivedLikes);

module.exports = router;
