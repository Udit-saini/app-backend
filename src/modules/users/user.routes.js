const express = require("express");
const userController = require("./user.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const { requireAdminApiKey } = require("../subscriptions/subscription.middleware");

const router = express.Router();

router.delete("/me", authMiddleware, userController.deleteMyAccount);
router.get("/", requireAdminApiKey, userController.listUsers);
router.get("/:id", requireAdminApiKey, userController.getUserById);
router.post("/", requireAdminApiKey, userController.createUser);
router.put("/:id", requireAdminApiKey, userController.updateUser);
router.delete("/:id", requireAdminApiKey, userController.deleteUser);

module.exports = router;
