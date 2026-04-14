const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const discoveryController = require("./discovery.controller");

const router = express.Router();

router.get("/feed", authMiddleware, discoveryController.getFeed);

module.exports = router;
