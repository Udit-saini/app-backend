const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const chatController = require("./chat.controller");

const router = express.Router();

router.get("/conversations", authMiddleware, chatController.getConversations);
router.post("/send", authMiddleware, chatController.postSendMessage);
router.post("/fcm-token", authMiddleware, chatController.registerFcmToken);
router.get("/:conversationId/messages", authMiddleware, chatController.getMessages);

module.exports = router;
