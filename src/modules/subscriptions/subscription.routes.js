const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const subscriptionController = require("./subscription.controller");

const router = express.Router();

router.post("/verify", authMiddleware, subscriptionController.verifySubscription);
router.get("/me", authMiddleware, subscriptionController.getMySubscription);
router.post("/cancel", authMiddleware, subscriptionController.cancelSubscription);

module.exports = router;
