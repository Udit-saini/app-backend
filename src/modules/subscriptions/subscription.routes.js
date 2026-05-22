const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const subscriptionController = require("./subscription.controller");
const { requireAdminApiKey } = require("./subscription.middleware");

const router = express.Router();

router.post("/verify", authMiddleware, subscriptionController.verifySubscription);
router.get("/me", authMiddleware, subscriptionController.getMySubscription);
router.post("/cancel", authMiddleware, subscriptionController.cancelSubscription);
router.patch(
  "/admin/users/:userId",
  requireAdminApiKey,
  subscriptionController.setUserSubscriptionByAdmin
);

module.exports = router;
