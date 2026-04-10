const express = require("express");
const authController = require("./auth.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/login", authMiddleware, authController.login);

module.exports = router;
