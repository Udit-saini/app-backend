const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const subscriptionController = require("./subscription.controller");
const { requireAdminApiKey } = require("./subscription.middleware");

const router = express.Router();

router.get("/plans", subscriptionController.getPlans);
router.post("/verify", authMiddleware, subscriptionController.verifySubscription);
router.get("/me", authMiddleware, subscriptionController.getMySubscription);
router.post("/cancel", authMiddleware, subscriptionController.cancelSubscription);
router.get("/admin/plans", requireAdminApiKey, subscriptionController.listPlansForAdmin);
router.get("/admin/plans/:planId", requireAdminApiKey, subscriptionController.getPlanForAdmin);
router.post("/admin/plans", requireAdminApiKey, subscriptionController.createPlanByAdmin);
router.put("/admin/plans/:planId", requireAdminApiKey, subscriptionController.updatePlanByAdmin);
router.delete("/admin/plans/:planId", requireAdminApiKey, subscriptionController.deletePlanByAdmin);
router.patch(
  "/admin/users/:userId",
  requireAdminApiKey,
  subscriptionController.setUserSubscriptionByAdmin
);

module.exports = router;
