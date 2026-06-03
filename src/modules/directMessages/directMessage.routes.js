const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const directMessageController = require("./directMessage.controller");

const router = express.Router();

router.post("/send", authMiddleware, directMessageController.sendDirectMessage);
router.get("/inbox", authMiddleware, directMessageController.getInbox);
router.get("/sent", authMiddleware, directMessageController.getSent);
router.get("/remaining", authMiddleware, directMessageController.getRemaining);
router.post("/:id/accept", authMiddleware, directMessageController.acceptDirectMessage);
router.post("/:id/reject", authMiddleware, directMessageController.rejectDirectMessage);

module.exports = router;
