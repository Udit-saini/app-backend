const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const tokenController = require("./token.controller");
const { requireAdminApiKey } = require("../subscriptions/subscription.middleware");

const router = express.Router();

router.get("/me", authMiddleware, tokenController.getMyWallet);
router.get("/admin/config", requireAdminApiKey, tokenController.listTokenConfigsForAdmin);
router.put("/admin/config/:key", requireAdminApiKey, tokenController.updateTokenConfigByAdmin);
router.post("/admin/users/:userId/top-up", requireAdminApiKey, tokenController.topUpUserTokensByAdmin);
router.put(
  "/admin/users/:userId/balance",
  requireAdminApiKey,
  tokenController.setUserTokenBalanceByAdmin
);
router.get("/admin/users/:userId/ledger", requireAdminApiKey, tokenController.getUserTokenLedgerByAdmin);

module.exports = router;
