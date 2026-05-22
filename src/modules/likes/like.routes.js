const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const likeController = require("./like.controller");

const router = express.Router();

router.post("/action", authMiddleware, likeController.recordAction);
router.get("/received", authMiddleware, likeController.getReceivedLikes);

module.exports = router;
