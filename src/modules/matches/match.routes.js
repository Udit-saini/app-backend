const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const matchController = require("./match.controller");
const { requireAdminApiKey } = require("../subscriptions/subscription.middleware");

const router = express.Router();

router.get("/admin", requireAdminApiKey, matchController.listAdminMatches);
router.get("/", authMiddleware, matchController.listMatches);
router.delete("/:matchId", authMiddleware, matchController.unmatch);

module.exports = router;
