const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const chatController = require("./chat.controller");

const router = express.Router();

router.get("/conversations", authMiddleware, chatController.getConversations);
router.post("/send", authMiddleware, chatController.postSendMessage);
router.post("/fcm-token", authMiddleware, chatController.registerFcmToken);
router.post("/:conversationId/seen", authMiddleware, chatController.markMessagesSeen);
router.get("/:conversationId/messages", authMiddleware, chatController.getMessages);

module.exports = router;
